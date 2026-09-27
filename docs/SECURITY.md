# SIMPLEIN SCHOOL ERP — Security Architecture (V1, Phase 13 Audit)

This document describes the **actual implemented** security posture after the
Phase 13 audit. Anything marked "not implemented" is a known, deliberate
limitation — not an assumed behavior.

---

## 1. Authentication & session handling

- **Supabase Auth is the sole credential authority.** Email+password only.
  Passwords are hashed by Supabase (bcrypt); the application NEVER stores,
  hashes, transmits (beyond the login call), or logs passwords.
- **Sessions:** httpOnly, Secure (production), SameSite=Lax cookies set by
  `@supabase/ssr`. No tokens in localStorage/sessionStorage. Access tokens are
  short-lived JWTs; refresh happens in `middleware.ts` on each request.
- **Session resolution:** every server call resolves
  `auth.uid() → public.users → { school_id, roles, is_active }` via
  `lib/auth/session.ts`. Anonymous → 401 `UNAUTHENTICATED`. Inactive users
  fail closed everywhere (session resolution, dashboard layouts, RLS helpers).
- **Provisioning:** logins are created by School Admins (TEACHER/PARENT/STUDENT
  roles only — SCHOOL_ADMIN is onboarding-only) or by the onboarding flow.
  Admin password resets never set a known password; Supabase reset links only.
- **Logout:** server-side `signOut()` clears cookies (API route + server action).

## 2. RBAC

- Static permission matrix in `lib/auth/rbac.ts` (single source of truth):
  SCHOOL_ADMIN manage-all; TEACHER read + module writes; PARENT read-only +
  notification read-state; STUDENT (activated in Phase 12) self-only reads.
- Deny-by-default: unknown resource/action → deny; no role strings outside
  the matrix.
- Backend enforcement is mandatory on every endpoint; frontend gates are UX
  only. Service-role escalation paths: admins cannot create SCHOOL_ADMIN,
  cannot grant roles outside {TEACHER, PARENT, STUDENT}, cannot disable
  themselves.

## 3. Tenant isolation

- Shared database + `school_id` + RLS (decision AD-1).
- Tenant context derives ONLY from the server-side session — never from body,
  query, or URL parameters. No endpoint accepts `schoolId`.
- Cross-tenant access returns **404** (not 403) to avoid existence oracles.
- Defense-in-depth at three layers: (1) service scope checks, (2) SQL RLS
  policies, (3) tenant-consistency triggers (`assert_child_same_school`,
  `assert_link_same_school`) + `school_id` immutability triggers.
- 273 automated tests include explicit cross-school denial suites for every
  module (School A → School B must fail).

## 4. Row Level Security — ⚠️ NOT LIVE-VERIFIED

- Policies for all ~35 tables are authored in migrations 0002–0012
  (`supabase/migrations/`), including link-scoped helpers
  (`teacher_can_access_section`, `parent_can_access_student`,
  `current_student_id`) and student published-only gating.
- **The policies have NEVER been executed against a live Postgres/Supabase
  instance** (no local tooling exists in the dev environment). Per-module
  SQL verification scripts are ready in `supabase/tests/phase2..12_rls.sql`.
- **BLOCKER:** a staging Supabase database must be provisioned and the RLS
  scripts executed before production launch. Until then, treat RLS as
  "authored, unit-tested at the service boundary, unverified at the database."

## 5. Parent-child access

- `student_parents` is the authorization primitive; every parent-facing read
  resolves links server-side (`getParentScope`). No `studentId` from a client
  is ever trusted for authorization — links are verified per request.
- Cross-school parent links are forbidden (DB trigger + service check).

## 6. Teacher scope

- Teachers see students/exams/marks/timetable/homework ONLY for sections
  where they are class teacher or subject assignee (`getTeacherScope`,
  `teacherCanEnterMarks`, `teacherCanAssignSubject`), verified per request
  and mirrored in RLS. Homework edits are author-only (AD-24). Teachers have
  NO fee access (no matrix entry → deny).

## 7. Student self-only scope (Phase 12)

- `students.user_id` (UNIQUE, tenant-checked) links a login to exactly one
  student. `getStudentScope()` resolves it; every student-facing read is
  self-only. Marks/report cards are published-only for students. Another
  student's id → 404 even within the same class (tested).

## 8. Service-role boundary

- `lib/supabase/admin.ts` throws in the browser and without the key. It is
  imported ONLY by: onboarding, user provisioning, and user enable/disable
  (Auth ban sync). Ordinary CRUD never uses the service role. Verified by
  audit (grep) — no page/component imports it.

## 9. File/storage access

- **All 6 buckets are private** (student-photos, teacher-photos,
  report-cards, homework-attachments, notice-attachments, fee-receipts, pyqs).
  No public URLs anywhere; downloads are always short-lived signed URLs
  (600 s) minted after the same authorization check as the owning record.
- Paths are tenant-prefixed (`schools/{school_id}/…`) and Storage RLS mirrors
  the DB scope per bucket.
- Upload validation: shared document allowlist (PDF/images/Office; ≤10 MB;
  macro-enabled/executable extensions blocked), photos ≤2 MB JPEG/PNG/WebP.
- Known limitation: no antivirus scanning (mitigated by blocklist; documented
  since Phase 1).

## 10. Input validation

- Zod on every external input boundary (API routes + server actions +
  import). Validation failures → 422 `VALIDATION_ERROR` with field details.
- Student Excel/CSV import: preview-before-commit, 2 MB / 200-row caps,
  per-row error reports, enrollment validation.
- SQL injection: all data access goes through the Supabase client
  (parameterized PostgREST). One dynamic-SQL exception:
  `listNotices` uses `ilike` with `%`/`_` stripped from user input.

## 11. API authorization

- Every `/api/v1/*` route (129 operations) authenticates via `requireAuth` /
  `requireRole`; the only unauthenticated routes are `GET /health`
  (liveness) and `POST /onboarding/school` (ONBOARDING_SECRET bearer,
  timing-safe compared). Audit confirmed no route missing auth.
- Consistent envelope; stable error codes; no stack traces or SQL in
  responses (unknown errors → `INTERNAL` with a generic message; details are
  server-logged only).

## 12. Secrets & environment variables

- `.env.example` documents names only (no values); `.gitignore` excludes
  `.env*`; repo scan found zero committed secrets or live keys.
- Required production variables: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only),
  `ONBOARDING_SECRET` (server-only, `openssl rand -hex 32`).

## 13. Rate limiting — implemented in Phase 13 (was a documented-only gap)

- `lib/security/rate-limit.ts` + `middleware.ts`: sliding-window per-IP tiers —
  AUTH 10 req/10 min (`/api/v1/auth/*`, `/api/v1/onboarding/*`), WRITE 120/min
  (other API mutations), READ 600/min (other API reads). 429 + `Retry-After`.
- **Limitation:** in-memory store is per-process; serverless instances do not
  share it, so limits are approximate under horizontal scaling. The
  `RateLimiter` interface is isolated for a Redis/Upstash swap.

## 14. CSRF & security headers — implemented in Phase 13

- Headers on all responses (`next.config.mjs`): `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- CSRF: session cookies are SameSite=Lax; all mutations are same-origin POST/
  PUT/PATCH/DELETE via server actions or the same-origin API (cross-site
  form posts are dropped by Lax + the JSON content type).
- **Not implemented:** a Content-Security-Policy. Next.js hydration requires
  either `unsafe-inline` (weak) or a nonce-based setup — deferred deliberately;
  revisit before public launch (see PRODUCTION_READINESS.md).

## 15. Audit logging

- Append-only `audit_logs` (no UPDATE/DELETE RLS policies; `school_id`
  immutable). Coverage after the Phase 13 pass: users, students (+photos,
  import, links), teachers (+assignments), parents, classes/sections/subjects
  (+links), academic years, attendance, exams (+schedules), marks
  (saved/locked/unlocked), results (published/unpublished), report cards,
  homework (+attachments), notices (+publish/unpublish, attachments),
  notifications fan-out, fees (structures/assignments/records/verify/void/
  receipts), promotions (approved/held/graduated/run), PYQs, and
  `school.created` (system actor). Sensitive changes (marks, fee voids) retain
  before/after values in `metadata`.
