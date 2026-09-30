# SIMPLEIN SCHOOL ERP — Data Governance (V1, Phase 15)

Scope: what school data the system holds, who owns it, how long it lives,
and how it dies. Legal retention periods are NOT invented here — every
`TBD (approval required)` below needs sign-off from school management /
legal counsel before pilot.

## 1. Sensitive data categories

| Category | Examples in this system | Handling |
|----------|------------------------|----------|
| Identity | names, emails, phones, addresses, DOB, photos | RLS + tenant isolation; minimal logging (ids only) |
| Academic | attendance, marks, grades, report cards, promotions | RLS + publish gating; append-only audit |
| Financial | fee structures, concessions, payment records, receipts | RLS + maker-checker verify/void; receipts immutable once verified |
| Credentials | passwords (Supabase Auth only — never in app DB) | Never logged/stored/transmitted beyond login call |
| Operational | audit logs, notifications | append-only (audit); per-user isolation (notifications) |

## 2. Ownership

- Each school owns its tenant data (`school_id` scope). SIMPLEIN SOLUTIONS
  LLP operates the platform; schools are data controllers for their records.
- Platform operators have NO super-admin backdoor in V1 (deliberate —
  see `docs/ARCHITECTURE.md` §4). Any future support role needs its own
  design review + audit policy.

## 3. Lifecycle & retention (placeholders — TBD approval required)

| Data | Retain | Basis |
|------|--------|-------|
| Academic records (attendance, marks, report cards) | TBD (suggested: duration of enrollment + 7 years) | TBD |
| Financial records (structures, assignments, payment records) | TBD (suggested: 8+ years, jurisdiction-dependent) | TBD |
| `audit_logs` | TBD (suggested: ≥ 7 years; never less than financial retention) | TBD |
| Notifications inbox | TBD (suggested: 1 year rolling) | TBD |
| Backups (DB + storage) | 30 days rolling (see `docs/BACKUP_AND_RECOVERY.md`) | operational |

## 4. Deletion / deactivation behavior (implemented)

- Users: deactivation (`is_active=false` + Auth ban), never hard-delete;
  login fails closed everywhere (layouts terminate session, RLS helpers go
  dark). Self-deactivation refused.
- Students: `status` transitions (`active|inactive|graduated|transferred`);
  rows retained for history (enrollments/attendance/marks untouched).
- Homework/notices/PYQs: soft-delete/archive flags (`is_active`),
  restorable by admins; history preserved.
- Fee records: voided, never deleted (`is_voided` + reason retained).
- Report-card PDFs: regenerable from data; orphan PDFs cleaned on failed
  saves; storage objects removed by janitor after the retention window.
- Hard deletes in V1 are restricted to narrow admin paths with audit rows;
  cascades never touch student/marks/fee/audit data (restrictive FKs).

## 5. Audit requirements

- Every mutation in §4 writes one append-only `audit_logs` row with
  actor/school/action/entity/diff-metadata (see `docs/SECURITY.md` §15).
- Sensitive diffs (marks, fee voids) retain before/after values so reviews
  need no second query. No passwords, tokens, or file bytes in audit rows.

## 6. Document / file handling

- All buckets private; tenant-prefixed paths; short-lived signed URLs
  (600s default) minted only after the owning record's authorization check.
- Upload allowlists (PDF/images/Office; macro/executable formats blocked),
  10 MB default cap (photos 2 MB). No antivirus scanning in V1 (mitigated by
  blocklist — revisit post-pilot).
- Fee receipts are immutable once linked to a verified record (new record
  supersedes); treat `fee-receipts` as the most critical bucket in backups.
