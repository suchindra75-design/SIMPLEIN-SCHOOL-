# SIMPLEIN SCHOOL ERP — Database trust model (fees, receipts, audit)

What the database enforces for fee records and the audit log, for whom, and
what it deliberately does not. Applies from migrations 0022–0026. Names only;
no secret values.

## 1. Who is calling

`public.fee_request_caller()` (0022) classifies every statement:

| Caller | How it is recognised | Typical path | Fee/receipt rules |
|--------|----------------------|--------------|-------------------|
| `api_user` | `role` setting or JWT role claim is `authenticated` or `anon` | the app and anyone with a user session calling PostgREST / Storage | **enforced** |
| `service_role` | JWT role claim or `role` setting is `service_role` | the service-role key (seed scripts, maintenance) | exempt, audited |
| `database` | neither of the above (no request JWT) | direct connections: migrations, the Supabase dashboard SQL/table editor, `psql` with the database password | exempt, audited |

The classification reads the session's `role` setting and JWT claims, which
SECURITY DEFINER functions and foreign-key cascades do not change, so a
guarded caller stays guarded inside triggers and cascades. The app never uses
the service role for fee records.

## 2. What is enforced for `api_user`

Payments (`fee_payment_records`, 0022/0024/0026): recorded in the caller's own
name, unverified, within the outstanding balance (assignment row locked);
amount, date, mode, reference, assignment, recorder and creation time never
change; verified once, by a different admin, never when voided, never
removed; voided once, by a different admin, with a reason; never deleted
(also not through cascades); creation time and version set by the server;
the receipt can be set or replaced only while unverified and not voided, not
in the statement that verifies/voids, and only to a file in the payment's own
folder `schools/<school>/fee-receipts/<payment>/<file>`.

Assignments (`student_fees`, 0022/0024): the total cannot drop below what has
been recorded; the student, fee structure and school cannot change once any
payment record exists (voided ones included); creation time set by the
server and never changed.

Receipt files (`storage.objects`, bucket `fee-receipts`, 0026): upload only by
a school admin, only into the folder of an unverified, non-voided payment of
their own school; no overwrite (upsert), update or move by any user session;
delete only of files that no payment refers to.

Audit log (`audit_logs`, 0025): appends with the caller as actor and their
own school; actions containing `.db_` (written by triggers) and a
`metadata.via` key are reserved; fee events only from school admins; the
creation time is set by the server.

## 3. What is enforced for every role

`audit_logs` cannot be updated, deleted or truncated by anyone while the
triggers `audit_logs_append_only` / `audit_logs_no_truncate` are in place —
including the service-role key (PostgREST) and direct connections. Every
change to a payment or an assignment, on every path, writes an audit row in
the same transaction (`fee_payment.db_*`, `fee_assignment.db_*`, with
`metadata.via`).

## 4. What the database cannot stop (by design)

- **The database owner.** `postgres` owns the tables. An owner can `ALTER
  TABLE … DISABLE TRIGGER`, `DROP TRIGGER`, or change policies, and a
  superuser can bypass triggers altogether. Triggers stop the app, API users
  and the service-role key; they do **not** stop whoever holds the database
  password or dashboard access with SQL rights. Such changes are DDL, visible
  in Postgres logs and in the migration history if made properly.
- **Trusted-path data changes.** The service-role key and direct connections
  may still correct, delete or re-assign fee records and receipt files
  (exempt, so seeds and repairs work). Database changes are audited
  (`via = service_role | database`); Storage changes made with the service
  role are not recorded by these policies.
- **Self-attested app events.** Rows the app writes through `logAudit` are
  appended with the caller's session: the actor is always the real caller,
  but the content is what that caller's code chose to write. For fees, the
  `*.db_*` rows written by the database are the authoritative record.
- **Existing data.** 0022–0026 check new changes only. Run
  `scripts/sql/fee-integrity-precheck.sql` (read-only) before applying them
  and review its findings (the local demo seed, for example, contained
  self-verified payments until it was corrected).

## 5. Recommended privileged-access controls (owner actions)

1. Rotate the service-role/secret key, the database password and (for legacy
   keys) the JWT secret after the earlier exposure; keep the service-role key
   only in server-side Vercel env (never `NEXT_PUBLIC_*`).
2. Limit Supabase organisation/project members to the people who need them,
   with MFA, and give read-only roles to anyone who only needs to look.
3. Do not share the database password; use it only for migrations and
   incident work, from a known machine, and rotate it after use by others.
4. Keep the audit trail outside the database too: a log drain or a periodic
   export of `audit_logs` to append-only storage, so a database owner cannot
   silently rewrite history.
5. Enable point-in-time recovery and run the restore drill
   (`docs/BACKUP_AND_RECOVERY.md`).
6. Treat any `ALTER TABLE … DISABLE TRIGGER`, `DROP TRIGGER` or policy
   change on these tables outside a reviewed migration as an incident.

## 6. Concurrency

PostgREST requests run in READ COMMITTED. A guarded payment insert locks the
assignment row (`SELECT … FOR UPDATE`) before checking the balance, so two
recordings cannot both fit; a re-assignment needs a conflicting lock on the
same row, so it either waits for a payment and then sees it (refused), or
completes first and the payment is then recorded against the re-assigned
assignment (audited). Verifying and changing a receipt update the same
payment row and serialise the same way. Both orders are exercised with real
overlapping sessions in `tests/integration/fee-integrity.test.ts`.
