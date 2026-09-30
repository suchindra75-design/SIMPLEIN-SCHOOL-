# SIMPLEIN SCHOOL ERP — Risk Register + ADRs (V1, Phase 15)

Impact/Likelihood: H/M/L. Owner TBD everywhere (requires staffing
approval). Status: OPEN unless stated. Reviewed against the actual repo —
no risk is marked mitigated unless the mitigation exists in code or docs.

## 1. Risk register

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|----|------|--------|------------|------------|-------|--------|
| R1 | Production environment not created | H | Certain (now) | Follow `docs/PRODUCTION_DEPLOYMENT.md` §4 | TBD | OPEN |
| R2 | No database backups / PITR | H | Certain | Enable PITR + nightly dumps + storage sync (`docs/BACKUP_AND_RECOVERY.md`) | TBD | OPEN |
| R3 | Restore never drilled | H | Certain | Monthly drill into scratch project before pilot | TBD | OPEN |
| R4 | No error tracking (Sentry) | H | Certain | Wire SDK + source maps + alerts (`docs/MONITORING.md`) | TBD | OPEN |
| R5 | No uptime monitoring | M | Certain | External checks on `/api/v1/health` + synthetic login | TBD | OPEN |
| R6 | SMTP not configured (password resets dead) | M | Certain | Configure sender; test reset email on staging | TBD | OPEN |
| R7 | No CSP header | M | Certain | Nonce-based CSP design before public launch (explicitly NOT `unsafe-inline`) | TBD | OPEN |
| R8 | In-memory rate limiter is per-process (approximate on serverless) | M | Likely at scale | Accept at pilot scale; swap to Redis/Upstash via isolated interface whenvolume demands | TBD | OPEN (accepted at pilot scale) |
| R9 | No CI pipeline (manual gates only) | M | Certain | Adopt `docs/CI_CD.md` pipeline; tenant/RBAC suites block merges | TBD | OPEN |
| R10 | Legal retention periods undefined | M | Certain | Get sign-off; fill `docs/DATA_GOVERNANCE.md` placeholders | TBD | OPEN |
| R11 | No antivirus scanning for uploads | L | Possible | Macro/executable blocklist mitigates; revisit post-pilot | TBD | OPEN (accepted) |
| R12 | AUTH tier (10 req/10 min/IP) can annoy legitimate bursts (observed in staging E2E) | L | Likely | Documented; tune only with abuse analysis, never silently | TBD | OPEN |
| R13 | Single-admin maker-checker stall (verify/void needs a second admin) | L | Possible at small schools | Documented workflow; service enforces maker≠checker | TBD | OPEN |
| R14 | `notice_targets` unique index cannot fire on same-shape rows (NULLs never conflict) | L | Certain (by schema) | Shape CHECK governs; documented in phase10 suite; revisit only if duplicate targets observed | TBD | OPEN (accepted) |

## 2. Architecture Decision Records (post-baseline; AD-1… live in `docs/ARCHITECTURE.md` §28)

| # | Decision | Why | Status |
|---|----------|-----|--------|
| AD-30 | `exam_subject_is_published()` SECURITY DEFINER helper instead of a student `exam_subjects` grant (migration 0013) | Exposes one boolean, zero rows; fixes student-marks invisibility without widening reads | Implemented + live-proven (phase12 37→41) |
| AD-31 | Own-class STUDENT reads on `exams`/`exam_subjects`/`exam_schedules` (migration 0014) | Service result/report flows load exam context first; students need their own class's exams (already the API contract) | Implemented + live-proven (E2E student results/PDF 200) |
| AD-32 | `prevent_identity_change()` exempts ONLY the `service_role` JWT (migration 0015) | Trigger blocked even trusted provisioning (disable/enable 500s); row-level writers still rejected (phase2 green) | Implemented + live-proven (disable→reject→enable→login) |
| AD-33 | Strict `queryBoolSchema` replaces `z.coerce.boolean()` on 8 query flags | `"false"` coerced to `true` (PYQ archive never archived); strict parse + unit tests | Implemented + tested (`common.test.ts`) |
| AD-34 | Nested `sections(name, classes(name))` embed + flatten (timetable/homework) | No direct FK exists; top-level embed 500s on every list; DTO/UI unchanged | Implemented + tested + live-proven |
| AD-35 | `user_roles` role filter via two-step id resolution | Hinted inline filter is invalid PostgREST; pagination/total semantics preserved | Implemented + tested (`users.test.ts`) + live-proven |
| AD-36 | Per-student promotion failures collected in 201 payload (not HTTP 409) | Batch semantics per docs; docstring corrected to match | Documented behavior, E2E-proven |
| AD-37 | CSP deliberately deferred (no `unsafe-inline`) | Next hydration needs nonce architecture; weak policy worse than none + other headers | Documented, revisit pre-launch |
| AD-38 | No CI yet; manual gates (`typecheck+lint+test+build`, RLS suites) required per release | Honest status over claimed pipeline | Documented (`docs/CI_CD.md`) |
