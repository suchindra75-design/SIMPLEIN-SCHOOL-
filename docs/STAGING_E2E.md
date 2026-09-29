# SIMPLEIN SCHOOL ERP — Phase 14 Staging Validation Record (V1)

Validation phase (no features). This document records what was validated,
what is blocked, and exactly how to unblock the remainder.
**No secrets are stored in this repo — only variable and account names.**

## 1. Environment gate — RUNTIME PORTION STOPPED SAFELY

`npm run check:env` reports all required names MISSING (no `.env.local` exists):

| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | MISSING |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | MISSING |
| `SUPABASE_SERVICE_ROLE_KEY` | MISSING (server-only) |
| `ONBOARDING_SECRET` | MISSING (server-only) |
| `NEXT_PUBLIC_APP_URL` | MISSING (optional) |

Linked staging project (`simplein school`, ap-northeast-2) is ACTIVE_HEALTHY
and reachable via the Supabase CLI Management API, so all database-level
validation below ran against real staging PostgreSQL. Per the phase brief §1,
everything requiring the app runtime was stopped safely and NOT attempted:
no app boot, no login/session attempts, no Auth users or passwords created
(creating credentials with no secure delivery channel would violate the
no-secrets rule), no persistent seed data written (pgTAP fixtures roll back;
orphan rows with no logins would only pollute shared staging).

## 2. Test accounts — NONE created (blocked, by design)

Intended dedicated test-school accounts (create only after §1 unblocked,
via onboarding + `/users`, passwords outside Git):

| Role | Intended login scope | Status |
|------|----------------------|--------|
| SCHOOL_ADMIN | School A full management | NOT CREATED — blocked on env |
| TEACHER | assigned section(s) of School A | NOT CREATED — blocked on env |
| PARENT | linked child(ren) in School A | NOT CREATED — blocked on env |
| STUDENT | own data in School A | NOT CREATED — blocked on env |

All role behavior below was instead proven with realistic JWT/RLS contexts
(`authenticated` role + `request.jwt.claims.sub` per role) against the live
schema — 282 assertions, all passing (§5).

## 3. Staging dataset — ephemeral pgTAP fixtures (rolled back)

No persistent dataset was written (§1). Each suite builds a self-contained
two-school world (School A + School B with admin/teacher/parent/student,
classes/sections/subjects, links, enrollments, attendance, exams, marks,
fees, notices, PYQs, storage objects) and rolls it back. Coverage map:

| Phase | Suite | Live result |
|-------|-------|-------------|
| 2 identity/tenant | 11 | 11/11 |
| 3 people/structure | 28 | 28/28 |
| 4 attendance | 18 | 18/18 |
| 5 exams | 20 | 20/20 |
| 6 marks/grades | 30 | 30/30 |
| 7 report cards + bucket | 25 | 25/25 |
| 8 timetable | 21 | 21/21 |
| 9 homework + bucket | 32 | 32/32 |
| 10 notices/notifications + bucket | 28 | 28/28 |
| 11 fees + bucket | 32 | 32/32 |
| 12 portal/promotion/PYQs + bucket | 37 | 37/37 |
| **Total** | | **282/282** |

## 4. Workflows validated at the RLS/trigger layer (§7–§10 intents)

- Academic chain: enrollment → attendance session/records → exam + subjects →
  marks entry → lock blocks teacher edits → publish gates parent/student reads
  → report-card snapshots (phases 4, 5, 6, 7, 12).
- Promotion: next-year enrollment insert (admin allowed, student/teacher
  denied), duplicate `(student, year)` blocked, placement repoint, cross-school
  reads denied (phase 12).
- Fees: structures/components/assignments/records tenant-isolated; parent sees
  linked non-voided only; teacher/parent writes denied; CHECKs (amount, mode);
  maker-checker + balance math remain service-level (unit-tested, 21 tests).
- PYQs: same-school reads for all roles, admin-only writes, tenant triggers,
  private bucket + tenant-filtered object reads (phase 12).
- Notices/notifications: audience targeting in RLS (SCHOOL/CLASS/SECTION/
  TEACHERS/PARENTS), recipient isolation incl. mark-read, teacher fan-out
  allowed / parent fan-out denied / cross-school fan-out denied (phase 10).

## 5. Security scenarios proven live (§6 intents)

School A → School B denied (every module, reads + writes); parent →
unlinked child denied; student → peer denied (incl. same-section peer);
teacher → unassigned section denied; unpublished parent/student results
denied; **student published own marks allowed (migration 0013 fix)**; peer
marks denied; private buckets (`report-cards`, `homework-attachments`,
`notice-attachments`, `fee-receipts`, `pyqs`) + tenant-filtered object reads;
`signed-URL-only` download paths are service-side (unit-tested
`lib/services/storage.test.ts`) — raw object reads, not URL minting, were
asserted live.

## 6. Failures found and fixed during validation

1. **Phase10 E-immutable vs migration 0013:** the new `notices_no_move`
   trigger fires before RLS, so the admin move attempt now raises
   `school_id is immutable` instead of the RLS message. Harness expectation
   updated (one pattern); suite back to 28/28. This confirms 0013 behaves
   exactly like all sibling tables. No production change.
2. **No other regressions** from 0013 across phases 2–9, 11, 12.

## 7. Known limitations / blockers

- App-runtime E2E (§4 UI portals, real login/logout/inactive denial, signed-URL
  minting clicks, fee paid/due screens, promotion UI) is **entirely untested**
  — blocked on §1 env vars + test accounts.
- `supabase test db --linked` (pg_prove runner) needs Docker, unavailable
  here; identical suites execute via `db query --linked`.
- Prior known items unchanged: Auth SMTP, PITR/backups, Sentry/uptime, CSP
  (see `docs/PRODUCTION_READINESS.md`).

## 8. Unblock runbook (manual E2E, when credentials exist)

1. Fill `.env.local` (names in §1) from Supabase dashboard + Vercel env; never commit.
2. `npm run check:env && npm run dev`; create school via onboarding; create the
   §2 users via `/users` (TEACHER/PARENT/STUDENT only).
3. Seed §3 dataset through the UI/API as the admin; run §5–§11 role checks
   manually; record outcomes here.
4. Re-run all `supabase/tests/phase*_rls.sql` after persistent data exists.
