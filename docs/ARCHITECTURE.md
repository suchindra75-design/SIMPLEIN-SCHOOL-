# SIMPLEIN SCHOOL ERP — V1 Architecture

**Product:** SIMPLEIN SCHOOL ERP · **Owner:** SIMPLEIN SOLUTIONS LLP
**Scope:** V1 only (School Admin ↔ Teachers ↔ Parents). No online payments in V1.
**Status:** Architecture foundation phase. No feature modules implemented yet.

---

## 1. Product overview

SIMPLEIN SCHOOL ERP is a multi-school (multi-tenant) SaaS platform connecting
School Admins, Teachers, and Parents. V1 ships three dashboard shells
(Admin, Teacher, Parent) and the following modules:

Authentication · School/Tenant · Users · Students · Parents · Teachers ·
Classes/Sections/Subjects · Attendance · Exams · Marks/Grades · Report Cards ·
Timetable · Homework · Notices · Notifications (internal only) ·
Fee Tracking (display + offline records only, **no payment processing**).

Explicitly OUT of V1: online payments (UPI/card/gateway/refunds), external
SMS/WhatsApp integrations, student-facing dashboard (the STUDENT role exists in
the auth model but has no UI), teacher substitution (deferred unless it fits
cleanly into the timetable model later).

A parent account may be linked to **multiple children**, possibly across
different schools. Each school's data is completely isolated.

## 2. Technology stack (final, after environment inspection)

The target directory was **empty** (clean project, no existing stack to
preserve). Environment: Node 24, npm 11, macOS, no local PostgreSQL. The stack
below is chosen for a small AI-assisted team: one codebase, managed services,
minimal DevOps.

| Layer        | Choice                                                        |
|--------------|---------------------------------------------------------------|
| Frontend     | Next.js 15 (App Router) + React 19 + TypeScript (strict)      |
| Styling      | Tailwind CSS v4                                               |
| Backend      | Next.js Route Handlers exposing REST ` /api/v1/*`             |
| Database     | PostgreSQL, hosted on Supabase, migrations in `supabase/`     |
| Auth/session | Supabase Auth (email/password, JWT) + `@supabase/ssr` cookies |
| Storage      | Supabase Storage (private buckets, signed URLs only)          |
| Validation   | Zod (shared schemas in `lib/validation/`)                     |
| Data fetching| React Server Components by default; client components minimal |
| API docs     | OpenAPI 3.1 (`docs/API.md` now; generated spec in roadmap)    |
| Testing      | Vitest (unit) + Playwright (e2e) — see §15                    |
| Deployment   | Vercel (app) + Supabase (PG/Auth/Storage); HTTPS enforced     |

Why this stack:

- **One repo, one deployable.** Next.js hosts UI + REST API, so a small team
  maintains a single TypeScript codebase with shared Zod schemas and types.
- **Tenant isolation at the database layer.** Supabase is managed PostgreSQL
  with Row Level Security (RLS). RLS lets us enforce `school_id` isolation in
  the database itself (§4), which is stronger and simpler than app-only
  filtering and works for every client (web now, mobile later).
- **No password/session code to invent.** Supabase Auth provides secure
  hashing, JWTs, refresh rotation, and httpOnly cookie sessions via
  `@supabase/ssr`. We add the school/role layer on top (§5–§6).
- **Files without a file server.** Supabase Storage gives private buckets +
  RLS + signed URLs, matching the secure-file-access requirement (§9).
- **AI-friendly.** Zod schemas are the single source of truth for validation,
  generated types, and (later) OpenAPI — easy for humans and assistants to
  extend consistently.

Alternatives rejected: separate backend framework (Nest/Express) — unnecessary
operational overhead for V1; NextAuth + self-hosted PG — more code to secure
and operate; Firebase — weaker relational/RLS story for report cards, fee
ledgers, and audit trails.

## 3. System architecture

Monolithic-modular ("modular monolith") Next.js application:

```text
Browser
  │ HTTPS
  ▼
Next.js (Vercel)
├── App Router UI ── Server Components (role-gated shells)
│     └── /admin/*  /teacher/*  /parent/*  (UX gating ONLY)
├── Route Handlers ── /api/v1/* (authN + RBAC + tenant guard, Zod validation)
│     ├── lib/auth/*   session, RBAC matrix
│     ├── lib/tenant/* tenant context resolution
│     ├── lib/validation/* Zod schemas (shared UI + API)
│     └── lib/services/* business logic (one home per rule, no duplication)
▼
Supabase
├── PostgreSQL + RLS (tenant + role enforcement, audit_logs)
├── Auth (identities, JWTs, password policy)
└── Storage (private buckets, signed URLs)
```

Request lifecycle (every authenticated request):

1. `middleware.ts` refreshes the Supabase session cookie.
2. Route handler creates a server Supabase client bound to the request cookies.
3. `requireSession()` resolves `auth.uid()` → `public.users` row →
   `{ userId, schoolId, roles }` (tenant context comes **only** from this
   server-side lookup — never from client parameters).
4. `requirePermission(resource, action)` checks the RBAC matrix (§6).
5. Zod validates input; service executes with `school_id` predicate; RLS
   re-enforces the same predicate in SQL as defense-in-depth.
6. Sensitive mutations append to `audit_logs`.
7. Responses use the standard envelope (`lib/api/response.ts`):
   `{ data } | { error: { code, message } }`; no stack traces or SQL leaks.

Module isolation rule: page components contain no SQL and no business rules;
all rules live in `lib/services/<module>/` and are imported by both Route
Handlers and (where needed) Server Components.

## 4. Multi-tenant strategy — DECISION

**Decision: shared database, shared schema, `school_id` discriminator on every
school-owned row, enforced by PostgreSQL Row Level Security.**

Every school-owned table carries `school_id UUID NOT NULL REFERENCES
schools(id)`, and RLS policies restrict all access to rows whose `school_id`
matches the caller's tenant claim. The tenant claim is derived server-side
from `public.users.school_id` for the authenticated `auth.uid()` — it is
never accepted from request input.

Why not separate schemas or databases per school (V1):

| Option             | V1 verdict | Reason                                                              |
|--------------------|------------|---------------------------------------------------------------------|
| Shared DB + `school_id` + RLS | **Chosen** | One migration set, one connection pool, trivial onboarding of school N+1, isolation enforced in SQL, scales to hundreds of schools on one cluster. |
| Separate schemas   | Rejected   | Multiplies migrations (`N` schemas × every change), complicates connection pooling and backups, no security gain over correct RLS. |
| Separate databases | Rejected   | Heaviest operations burden (provisioning, migrations, backups, monitoring per school); justified only for regulatory/data-residency or mega-tenant needs — none in V1. |

Enforcement layers (all three, always):

1. **Database (authoritative):** RLS `USING`/`WITH CHECK` policies on every
   tenant table; `school_id` immutable after insert (trigger); service-role
   key used only in controlled server contexts (migrations, PDF workers) and
   still passes explicit `school_id`.
2. **API (mandatory):** tenant context resolved from session; every query and
   mutation predicates on it; cross-school IDs return 404 (not 403, to avoid
   existence oracle).
3. **UI (convenience only):** dashboard shells and selectors operate within
   the session school; never trusted.

Special cases:

- **Parents with children in multiple schools:** the `users` row carries the
  parent's *primary* school for session scoping, while `student_parents` links
  grant access per child. Parent-scoped queries authorize via link existence
  (`EXISTS (… student_parents …)`), additionally bounded by each child's own
  `school_id`. A parent can never enumerate unlinked students (list endpoints
  for parents return only linked children).
- **Platform operators:** no super-admin backdoor in V1. Any future
  cross-school support role requires its own design review and audit policy.
- **Indexes:** composite `(school_id, <entity key>)` on every tenant table
  (see `docs/DATABASE.md`); `school_id` is always the leading column so tenant
  pruning applies first.

## 5. Authentication

Supabase Auth is the **sole source of truth** for credentials and password
management. There is NO custom password hashing and NO password column anywhere
in the application database. Implemented in Phase 2:

- **Login flow:** `/login` Server Component → `LoginForm` posts to the
  `loginAction` server action → Zod validation → Supabase
  `signInWithPassword` (sets httpOnly, Secure, SameSite=Lax cookies via
  `@supabase/ssr`) → `getCurrentUser()` resolves
  `auth.uid() → public.users → user_roles + schools` → role-aware redirect
  (`SCHOOL_ADMIN → /admin`, `TEACHER → /teacher`, `PARENT → /parent`,
  `STUDENT → /student` dormant page). No tokens in localStorage, ever.
- **Guards (`lib/auth/session.ts`):** `getCurrentUser()` (null when anonymous;
  throws `InactiveUserError` / `MissingProfileError` otherwise),
  `getCurrentProfile()`, `getCurrentSchool()`, `requireAuth()`,
  `requireRole()`, `requirePermission()` (against the `lib/auth/rbac.ts`
  matrix), `requireSchoolAccess()` (cross-school → `TenantBoundaryError` →
  HTTP 404, never 403-with-existence). `requireSession()` (legacy
  `TenantContext`) is preserved and now really backed by Supabase.
- **Route protection (two layers):** `middleware.ts` refreshes the session and
  redirects anonymous users away from `/admin|/teacher|/parent` to `/login`;
  each dashboard layout re-verifies via `requireDashboard()` (wrong role →
  own home; inactive/unprovisioned → session terminated → `/login?error=disabled`).
  Middleware is never the final word — API routes enforce independently.
- **Logout:** server action + `POST /api/v1/auth/logout`, server-side
  `signOut()` clearing cookies.
- **Inactive/disabled users:** fail closed everywhere — resolution throws,
  layouts terminate the session, RLS helper `current_school_id()` excludes
  inactive rows so the database also goes dark for them.
- **Password management:** Supabase-owned (email reset flow; 10-char minimum
  enforced at onboarding validation); admin provisioning uses the Admin API
  with `email_confirm: true`, never a shared/known password.
- **Rate limiting (§12):** auth endpoints throttled most aggressively
  (login/reset), then write endpoints, then reads.

### 5.1 Service-role boundary (mandatory)

- Browser code and ALL ordinary request handlers use the authenticated
  user-context clients (`lib/supabase/client.ts`, `lib/supabase/server.ts`).
  RLS applies to everything they do. Bypassing RLS for ordinary CRUD is forbidden.
- `lib/supabase/admin.ts` (`createAdminClient()`, service-role key) is
  **server-only** (throws in the browser, throws when the key is absent) and
  reserved for trusted operations ONLY: school onboarding
  (`lib/services/onboarding.ts`) and user/role provisioning. It must never be
  imported by client components, never used as a CRUD convenience, and the key
  must never enter the browser bundle or the repo (server env only).
- Identity-table writes (`users`, `user_roles`) have NO authenticated
  INSERT/DELETE RLS policies, and a database trigger
  (`prevent_identity_change()`) rejects any row-level change to
  `school_id / auth_user_id / email / is_active` — so even a compromised
  anon-key session cannot escalate privileges or jump tenants; only the
  service-role path can provision identity.

## 6. RBAC

Roles (enum `app_role`): `SCHOOL_ADMIN` · `TEACHER` · `PARENT` · `STUDENT`.
`STUDENT` exists in the enum, permission matrix, RLS helpers, and tests, but
has **no dashboard and no permissions granted** in V1 (dormant by design).

Assignment: `user_roles(user_id, role)` — a user holds one or more roles;
`public.users` keeps no role column (single source of truth is `user_roles`).
Permission model: static matrix in `lib/auth/rbac.ts`:

```text
SCHOOL_ADMIN (scoped to own school): full CRUD on school data — users,
students, parents, teachers, classes, subjects, exams, marks, timetables,
homework, notices, fee structures/records, settings, reports.
TEACHER: read assigned classes/sections/students (via class_teacher /
teacher_subjects links); mark attendance for assigned sections; enter/edit
unpublished marks; create homework; read own timetable; read notices.
PARENT: read linked children only (+ their attendance, marks (published),
exams, timetable, homework, notices, fees); manage own profile.
STUDENT: (dormant — deny by default)
```

Rules:

- Backend enforcement is **mandatory** on every endpoint (`requirePermission`
  / `requireLinkToStudent` / `requireTeachesSection`). Frontend role gates
  are UX only.
- Teacher scoping is link-based, not blanket: no assignment link → no access
  (returns 404).
- Parent scoping is link-based via `student_parents`: no link → no access
  (returns 404, never 403-with-existence).
- Deny-by-default: unknown resource/action → deny; `STUDENT` role → deny all
  in V1.
- Permission constants live in exactly one place (`lib/auth/rbac.ts`); no
  hard-coded role strings in handlers or components.

## 7. Database architecture

Full entity reference: **`docs/DATABASE.md`**. Summary:

- ~30 tables in `public` schema: `schools`, `users`, `user_roles`,
  `academic_years`, `classes`, `sections`, `students`, `parents`,
  `student_parents`, `teachers`, `subjects`, `class_subjects`,
  `teacher_subjects`, `attendance_sessions`, `attendance_records`, `exams`,
  `exam_subjects`, `exam_schedules`, `marks`, `grading_systems`,
  `grading_rules`, `report_cards`, `timetable_slots`, `homework`,
  `homework_attachments`, `notices`, `notice_audience`, `notifications`,
  `fee_structures`, `fee_components`, `student_fee_assignments`,
  `fee_payment_records`, `documents`, `audit_logs`.
- **Fee naming (deliberate):** the table is `fee_payment_records` — a ledger of
  *offline amounts recorded by the school* (`recorded_by`, `mode ∈
  CASH|CHEQUE|BANK_TRANSFER|OTHER`, `receipt_document_id`). There is no
  `transactions`/`payments`/`refunds` vocabulary anywhere, so no future reader
  mistakes V1 records for gateway processing. Outstanding = assigned total −
  Σ verified records; computed in SQL views, never trusted from client math.
- **Attendance:** header/grain split — `attendance_sessions` (one row per
  section per day) + `attendance_records` (one row per student, unique per
  session). Percentages computed by view; edits create new versions + audit.
- **Marks:** `marks` unique per `(exam_subject_id, student_id)`; edits allowed
  until `exam_subjects.is_locked`; publishing is an explicit audited action;
  grade/percentage derived from `grading_rules` (configurable per school).
- **Keys:** UUID PKs (`gen_random_uuid()`), FKs with restrictive deletes
  (students/marks/fees are never cascade-deleted), `created_at/updated_at`
  everywhere, optimistic-locking `version` on marks and fee records.
- **Migrations:** ordered SQL in `supabase/migrations/`, RLS policies shipped
  in the same migration as their table. Seed scripts are dev-only and clearly
  labeled; production paths never contain fake data.

## 8. API architecture

Full endpoint reference: **`docs/API.md`**. Conventions:

- Base path `/api/v1`, REST, JSON. Version prefix reserved so V2 can coexist.
- Standard envelope: success `{ "data": … }` (+ `{ "meta": { page, … } }`
  for lists); errors `{ "error": { "code": "NOT_FOUND", "message": "…" } }`
  with stable snake_case codes (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
  `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`).
- Auth: session cookie; every endpoint declares `auth` + minimum permission;
  tenant scope derives from session (§4) — no `schoolId` request params.
- Pagination: `?page&limit` (cap 100) on all list endpoints; large
  result/attendance exports are paginated or background jobs, never unbounded.
- Idempotency: attendance upsert and marks entry accept client `Idempotency-Key`
  for safe retries on bulk school-network uploads.
- Validation: Zod schemas in `lib/validation/<module>.ts` shared by client
  forms and handlers; failures → `422 VALIDATION_ERROR` with field errors.
- OpenAPI: `docs/API.md` is the V1 contract now; generating
  `openapi/openapi.json` from Zod schemas (via `zod-to-openapi`) plus Swagger
  UI is a roadmap item before pilot (§16).

## 9. File storage

- **Backend:** Supabase Storage, **all buckets private**. Buckets:
  `student-documents`, `student-photos`, `homework-attachments`,
  `notice-attachments`, `fee-receipts`, `report-cards`.
- **Pathing:** `schools/{school_id}/{domain}/{entity_id}/{uuid}_{sanitized}` —
  tenant prefix enables Storage RLS mirroring the DB policy and makes orphan
  scans per school trivial. DB table `documents` is the metadata registry
  (`bucket, path, mime, bytes, uploaded_by, school_id`).
- **Access:** never public URLs. App mints **short-lived signed URLs**
  (default 5–15 min) only after passing the same RBAC + tenant/link checks as
  the owning record. Report-card PDFs are generated server-side into
  `report-cards/` and served the same way.
- **Upload validation:** allowlist by bucket (images/PDF/DOC/DOCX/XLSX);
  magic-byte check, 10 MB default cap (photos 2 MB), filename sanitized,
  executable/macro types rejected. ClamAV-style scanning is a post-pilot
  addition; until then macro-enabled Office formats (`.docm/.xlsm`) are blocked.
- **Deletion:** soft-delete DB row first (retention for audit/fees); storage
  object removed by a janitor job after the retention window; fee receipts are
  immutable once linked to a verified payment record (new record supersedes).

## 10. Notification architecture (internal only)

`notifications` table (persistent, per-user inbox) + fan-out writers in
`lib/services/notifications/`:

- **Events:** attendance marked (parent), homework assigned, exam scheduled,
  result published, notice published, fee due-date approaching, account
  created/disabled.
- **Delivery in V1:** in-app inbox + unread badge (polling/SSE; realtime
  subscription is a later optimization). No SMS/WhatsApp/email gateways in V1 —
  the `channel` enum reserves them for later without schema changes.
- **Fan-out:** queued per recipient (never one giant loop in a request);
  class-wide events enqueue in batches with pagination; failures retry with
  backoff and dead-letter to audit. Result/notice storms must not block the
  publishing request — enqueue then respond.
- **Preferences:** per-user opt-out for non-critical categories; attendance
  and result notifications are mandatory in V1.

## 11. Security architecture

- Hashing/sessions: per §5 (bcrypt via Supabase; httpOnly cookies; rotation).
- Transport: HTTPS everywhere in production (HSTS), Secure cookies, no mixed
  content; secrets only via env/Vercel + Supabase dashboards — **never
  committed** (`.env.example` documents names, never values).
- Authorization: deny-by-default RBAC + tenant guards + RLS (§4, §6).
- Input: Zod on every boundary (API, CSV/Excel import, file metadata);
  parameterized queries via Supabase client (no string-built SQL); Excel import
  runs in a size-capped, row-validated, dry-run-first pipeline.
- Output: error envelope without internals; cross-school IDs → 404;
  PII minimization in logs (ids, never passwords/marks dumps).
- Uploads: per §9 allowlists + size caps + signed-URL-only reads.
- Web risks: CSRF mitigated by SameSite cookies + origin check on mutations;
  XSS via React escaping + no `dangerouslySetInnerHTML` for user content;
  rate limiting per §12; security headers (CSP, frame-ancestors, nosniff).
- Backups: Supabase PITR + scheduled dumps tested by restore drill before
  pilot; `audit_logs` append-only (no UPDATE/DELETE grants to app roles).

## 12. Rate limiting strategy

Tiered, per-user (fallback per-IP) sliding windows, enforced at middleware/edge:

| Tier | Endpoints | Limit (initial) |
|------|-----------|-----------------|
| Auth | login, reset, refresh | 10 req / 10 min / IP, captcha/escalation on abuse |
| Write | attendance, marks, fees, uploads | 120 req / min / user |
| Read | lists, dashboards | 600 req / min / user |
| Heavy | imports, report generation, exports | queued + concurrency cap (1–2 per school) |

Exceeding → `429 RATE_LIMITED` with `Retry-After`. Bulk ops (attendance for a
section, marks for a subject) are single batched calls, not N requests.

## 13. Audit logging

Append-only `audit_logs(school_id, actor_id, action, entity, entity_id,
created_at, metadata JSONB)`. Audited: user create/disable, student
create/update, parent links, attendance create/modify, marks entry/edit/lock/
publish, fee structure/assignment/record changes, settings/branding changes,
report-card generation, document delete. Sensitive diffs (marks) store
`{ before, after }` values in `metadata` so reviewers can reconstruct what
changed without a second query. No UPDATE/DELETE on this table from app roles;
retention ≥ 7 years (configurable per school policy later).

## 14. Deployment architecture

```text
Vercel (Next.js app, preview + production) ──► Supabase project per env
(dev / staging / prod): PostgreSQL + Auth + Storage
```

- Environments: `dev` (local + Supabase dev), `staging` (pre-pilot gate),
  `prod`. Promote via migrations + env-specific secrets; never copy prod data
  down without anonymization.
- CI (§15) runs typecheck + lint + unit + RLS/tenant tests on every PR;
  staging deploy required before prod; DB migrations apply forward-only with a
  tested rollback note.
- Secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (public-safe), `SUPABASE_SERVICE_ROLE_KEY` (server-only, Vercel env),
  storage/PDF worker keys; all listed (without values) in `.env.example`.
- Backups/restore drill and uptime/error monitoring (Vercel Analytics + Sentry
  or equivalent) must be green before pilot onboarding.

## 15. Testing strategy

| Area | Requirement |
|------|-------------|
| Auth | login/logout, inactive-user denial, session expiry, password reset/change |
| RBAC | matrix unit tests for every role × resource × action; student-dormant test |
| Tenant isolation | **mandatory cross-school tests:** School A token accessing School B ids for students, attendance, marks, fees, documents → 404/empty; RLS tests at SQL level with two tenants |
| Parent-child authz | parent with 2 children sees both; parent CANNOT access unlinked child; unlinked list endpoints return only linked |
| Teacher-class authz | teacher sees assigned sections only; unassigned section → 404 on attendance/marks/students |
| Attendance | session upsert idempotency, leave vs absent, % view correctness, edit audit |
| Marks/grades | grading-rule engine fixtures (boundaries, failed/pass, CGPA), lock enforcement, publish gating |
| Fees | outstanding = assigned − verified records; voided/unverified excluded; receipt immutability |
| Files | unsigned/public URL rejected; signed URL respects RBAC; oversized/wrong-type upload rejected |
| API validation | Zod rejection tests per module; envelope shape; 404-not-403 for cross-tenant ids |

Tooling: Vitest for unit/service/RBAC/grading/fee-math; SQL-level RLS tests in
`supabase/tests/`; Playwright for login→dashboard→child-selector and
attendance happy paths. Tenant/RBAC suites block merges on failure.

## 16. V1 implementation roadmap (after architecture review)

1. **Foundation gate:** docs + repo skeleton + CI green. ✅ done.
2. Auth + users + school settings + academic years; RLS policies + tenant tests. ✅ done (Phase 2).
3. Students/parents/teachers + classes/sections/subjects + Excel import. ✅ done (Phase 3).
4. Attendance. ✅ done (Phase 4).
5. Exams + exam schedules. ✅ done (Phase 5).
6. Marks + grades. ✅ done (Phase 6). Timetable + fee tracking + documents hardening + audit coverage pass: next.
7. Report-card PDF + dashboard shells per role (child selector, "My Classes"), pagination +
   performance pass, OpenAPI generation, pilot readiness (backups, monitoring).

Explicitly deferred: payments, SMS/WhatsApp, student dashboard, substitution.

## 17. Phase 3: people & academic structure (implemented)

- **People/relationship architecture:** `users` (login) ↔ optional 1:1
  `teachers`/`parents` profiles (unlinked profiles allowed, logins attached
  later via user management); `students` are records only in V1 (no login).
  Services per domain (`lib/services/*.ts`) own tenant injection
  (`school_id` from session, never input), scope checks, and audit writes;
  routes are thin (auth → Zod → service → envelope). Shared DTOs
  (`lib/services/dto.ts`) keep one camelCase contract.
- **Teacher access-scope model:** a teacher sees exactly
  class-teacher sections ∪ `teacher_subjects` sections. Enforced twice:
  API pre-checks (`lib/auth/scope.ts`, 404 on violation) + RLS
  (`teacher_can_access_section()`). No blanket student access from the role.
- **Parent-child access model:** `student_parents` many-to-many both ways
  (multi-child, multi-guardian, `relation`, `is_primary`). Enforced twice:
  API (`assertParentStudentAccess`, 404) + RLS (`parent_can_access_student()`).
  Cross-school links are forbidden in V1 by a DB trigger (single-school
  parents; multi-school support is a later, explicitly-designed feature).
- **Academic enrollment approach:** classes/sections are school-level (not
  year-bound); `student_enrollments(student, year)` snapshots placement per
  academic year (`UNIQUE(student, year)`), auto-maintained on student
  create/update. Promotion = new enrollment row + repoint `students`, never
  history rewrite. One current year per school (partial unique index).
- **Excel import architecture:** upload (≤2 MB, csv/xlsx, first sheet) →
  flexible header mapping (aliases + optional `mapping` JSON) → pure
  row validation (`lib/validation/import.ts`, unit-tested) → preview →
  confirm (≤200 rows, per-row failure collection, parent find-or-create by
  phone + link, full audit). Files parsed in memory, never stored or public.
- **User management boundaries:** admins grant TEACHER/PARENT only (never
  SCHOOL_ADMIN — onboarding-only; never STUDENT — dormant), only to
  same-school unlinked profiles; cannot deactivate self; identity writes use
  the isolated service-role client after ctx authorization; passwords never
  logged.

## 18. Phase 4: attendance (implemented)

- **Authorization:** teachers mark/read ONLY their assigned sections
  (class-teacher ∪ `teacher_subjects` — existing scope helpers, no duplicate
  mechanism); parents read ONLY linked children (`student_parents`); admins
  only their own school. Enforced in BOTH services
  (`assertAttendanceSectionAccess`, `assertStudentAttendanceAccess` — 404
  boundary, never client-supplied ids) and RLS
  (`teacher_can_access_section()` / `parent_can_access_student()` inside the
  attendance policies). Parents are read-only; STUDENT dormant (no policies).
- **Enrollment context:** attendance resolves the applicable academic year
  for the date (year containing the date, else the school's current year —
  documented V1 rule) and loads the roster from `student_enrollments`
  (academic-year aware). Fallback (documented): when a section has no
  enrollment rows for the year (students created before any year existed),
  the students' current `section_id` pointer is used. No promotion logic yet.
- **Percentage rule (ONE consistent rule):** PRESENT counts fully, ABSENT
  counts against, LEAVE is excused (excluded from the denominator);
  percentage = present ÷ (present + absent), rounded to 2 decimals; null
  when there are no counted days (never a fake 100%). Implemented once in
  `lib/services/attendance/calc.ts` (pure, unit-tested) and used by student
  summary, section summary, and the parent view.
- **Timezone/date handling:** dates are SCHOOL-LOCAL calendar dates;
  `todayInSchoolTz()` derives "today" from `schools.timezone` (server-side;
  the server never uses its own local timezone). The UI date picker defaults
  to it and caps at it. The server validates YYYY-MM-DD format, ≥ 2000-01-01,
  and ≤ school-today + 1 day (minor device-clock skew tolerance; future marks
  rejected).
- **Transactional save strategy (honest limitation):** the Supabase JS client
  over PostgREST has no multi-statement transaction. Save = (1) session
  upsert (UNIQUE section+date dedupes; reopen just updates), (2) ONE batched
  records upsert (UNIQUE session+student; idempotent). The partial-failure
  window between (1) and (2) is tiny and a retry converges without
  duplicates — never presented as atomic; documented here and in code.
- **Audit:** one audit row per save (`attendance.created` / `attendance.updated`)
  with metadata `{ sectionId, date, total, changed: [{ studentId, from, to }] }`
  — actor/school come from the session context; old/new statuses are
  preserved for corrections. No secrets logged.
- **Performance:** indexed section/date and student/session queries; rosters
  and records fetched in single batched queries (no N+1); summaries computed
  server-side; history paginated.

## 19. Phase 5: exams + exam schedules (implemented)

- **Exam model:** `exams` (class-scoped event per academic year; configurable
  names; window `starts_on → ends_on`; activate/deactivate is explicit +
  audited) → `exam_subjects` (per-subject max/passing marks + schedule
  date/time; UNIQUE per exam; passing ≤ max enforced at the DB) →
  `exam_schedules` (1:1 room/invigilator detail, kept separate so schedule
  edits never touch marks configuration). No marks/results fields in this
  phase — configuration only; marks entry lands in Phase 6.
- **Exam authorization:** admins full management within their own school.
  Exams are CLASS-scoped, so relevance is class-based: a teacher sees exams
  whose class contains one of their assigned sections; a parent sees exams of
  linked children's classes. Enforced in BOTH services (`examScopeClassIds` +
  explicit checks, 404 boundary — no client-supplied ids) and RLS (the exams/
  exam_subjects/exam_schedules policies join through
  `teacher_can_access_section()` / `parent_can_access_student()`).
  Teachers/parents are read-only; STUDENT dormant.
- **Validation:** exam window `ends_on >= starts_on`; subject examDate must
  fall within the window (re-validated when the window changes); times are
  HH:MM 24-hour with `end > start`; marks `max > 0`, `passing >= 0`,
  `passing <= max` — enforced in Zod AND the service AND DB CHECKs. Duplicate
  exam definitions blocked by `UNIQUE(school_id, academic_year_id, class_id, name)`
  (409); duplicate subjects per exam by `UNIQUE(exam_id, subject_id)`.
- **Audit:** exam created/updated/activated/deactivated, subject config
  added/updated/removed, schedule upserts/removals — one append-only row per
  mutation with the session actor/school.
- **UI:** /admin/exams (list + filters + create/edit + subjects/schedule
  management), /teacher/exams (relevant schedule), /parent/exams (child
  selector + schedule). Functional, consistent with the existing design system.

## 20. Phase 6: marks + grades (implemented)

- **Marks model:** `marks` — one row per student per exam-subject
  (UNIQUE-deduped), with `marks_obtained` (null when absent), `is_absent`,
  server-computed `grade` snapshot, and `version` for optimistic locking.
  DB-enforced validity: marks ≤ max_marks and academic-enrollment validity
  (`validate_marks_row()` trigger — enrollment model first, class pointer
  fallback); CHECKs for bounds and absent/null consistency; tenant triggers
  reject cross-school references. Batched single upsert per save (no N+1).
- **Grading model:** `grading_systems` + `grading_rules` — configurable
  percentage bands per school (no hard-coded letters), CGPA-extensible via
  `grade_point`. One default system per school (partial unique index).
  Non-overlapping bands enforced by the `validateGradingRules` engine AND a
  DB trigger. Grade computation is ONE pure, unit-tested function
  (`lib/services/grades/calc.ts`) used by marks entry and results; boundary
  percentages resolve to the higher band; no rules → null (no fake grades).
- **Result states + lock/publish rules:** `exam_subjects.is_locked` (marks
  editable → locked; teacher edits rejected at BOTH the service (409) and
  RLS; admin corrections/unlock only — documented) and
  `exam_subjects.is_published` (parents see PUBLISHED results only — the
  whole result is withheld when any subject is unpublished, 404 boundary;
  enforced in BOTH service and RLS). Published results are read-only to
  teachers/parents. Lock/unlock/publish/unpublish are separate, explicit,
  audited admin operations.
- **Authorization:** teacher marks entry is class+subject scoped (class
  teacher of an in-class section → all subjects; subject assignee → their
  subject; otherwise 404); admin own school; parents linked children only.
  No client-supplied school/teacher/parent ids trusted anywhere.
- **Result calculation rule (documented):** total = Σ non-absent
  marks_obtained; maxTotal = Σ ALL max_marks (absent subjects contribute 0
  obtained but full max — absence counts against, consistent with the
  attendance philosophy); percentage rounded to 2 decimals; grade from the
  school's default grading rules.
- **UI:** /admin/marks (exam → subjects with lock/publish controls + review
  grid), /teacher/marks (exam → authorized subjects → grid + save + locked
  state), /parent/results (child + exam selector → published results).
  Functional, consistent with the existing design system.

## 21. Important architectural decisions (log)

| # | Decision | Why |
|---|----------|-----|
| AD-1 | Shared DB + `school_id` + RLS (§4) | Simplest secure V1; one migration stream; scales to pilot→many schools |
| AD-2 | Supabase Auth + cookies, no custom crypto | Avoids inventing password/session security |
| AD-3 | `fee_payment_records` naming; no `transactions` vocabulary | Makes "record vs processing" unambiguous in code and schema |
| AD-4 | Attendance session/record split | Correct grain for daily class attendance, % views, and edits |
| AD-19 | Lock/publish states on exam_subjects; publish = explicit + audited | Teacher edits die at lock; parents see published only — enforced in service AND RLS |
| AD-20 | Grade = pure function over school-defined bands; no hard-coded letters | Configurable per school; CGPA-extensible; one tested implementation |
| AD-21 | Absent subjects: 0 obtained, full max (counts against) | Consistent with the attendance absence philosophy; documented rule |
| AD-17 | Class-scoped exams with class-based relevance | Teacher/parent visibility follows class membership — simple, matches school reality |
| AD-18 | exam_schedules separate from marks config (1:1) | Room/invigilator edits never touch marks configuration |
| AD-15 | LEAVE excused from the percentage denominator | One documented rule; on-leave students neither present nor penalised |
| AD-16 | School-local dates via schools.timezone; ≤ today+1d | Server never trusts its own timezone; future marks rejected |
| AD-5 | Marks locked via `exam_subjects.is_locked`; publish is explicit + audited | Prevents silent post-publish edits; parents only see published |
| AD-6 | STUDENT role dormant in matrix | Authorization architecture complete without building student UI |
| AD-7 | Private buckets + signed URLs only | No uncontrolled public document URLs, ever |
| AD-8 | Cross-school access returns 404 | Avoids leaking record existence across tenants |
| AD-9 | Deny-by-default RBAC, single matrix file | One place to audit; no scattered role strings |
| AD-10 | Modular monolith (Next.js UI + API) | Small-team velocity; extract services later if scale demands |
| AD-11 | School-level classes/sections + `student_enrollments` history | Simple queries today; promotion-safe history without year-bound everything |
| AD-12 | Cross-school parent links forbidden in V1 (trigger) | Single-school invariant keeps authz auditable; multi-school is a later design |
| AD-13 | Link-scoped reads enforced twice (service 404 + RLS) | API fails fast without leaking existence; DB backstops every client |
| AD-14 | Identity writes via isolated service-role ops only (no authenticated policies) | Even a leaked anon session cannot escalate roles or jump tenants |

---

## Environment variables

See `.env.example`. Public (`NEXT_PUBLIC_*`) vs server-only keys are marked
there. Service-role key must never reach the browser bundle.

## Unresolved / deferred decisions

- Realtime vs polling for the notifications badge (default: polling; revisit if
  pilot schools report staleness pain).
- PDF engine for report cards (shortlist: server-side headless render vs
  `pdf-lib` templating; decision at roadmap step 5).
- File antivirus scanning vendor (deferred post-pilot; mitigated now by macro
  format blocklist).
- Multi-school parent session switching UX (data model already supports it via
  `student_parents`; shell UX lands with the Parent dashboard).
