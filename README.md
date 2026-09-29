# SIMPLEIN SCHOOL ERP (V1)

Multi-tenant school ERP by **SIMPLEIN SOLUTIONS LLP** — School Admin ↔
Teachers ↔ Parents. V1 has no online payments (fee tracking is display +
staff-recorded receipts only).

## Status

**V1 complete through Phase 13 (production-readiness audit).** All feature
modules are implemented; remaining work is staging verification and pilot
readiness (live RLS execution, backups/monitoring). See:

- `docs/ARCHITECTURE.md` — stack, multi-tenancy, auth/RBAC, security, roadmap (§16–§27 per-phase notes)
- `docs/DATABASE.md` — entities, relationships, RLS pattern
- `docs/API.md` — REST contract (`/api/v1/*`, 129 operations; generated spec in `docs/openapi.yaml`)
- `docs/STAGING.md` — staging env wiring + fail-closed behavior + smoke test
- `docs/PRODUCTION_READINESS.md` — blockers checklist (RLS live-run, SMTP, PITR, monitoring)
- `docs/SECURITY.md` — implemented posture + known limitations

Implemented: Auth + users/onboarding · People + Excel import · Attendance ·
Exams · Marks/grades · Report cards + PDF · Timetable · Homework · Notices +
notifications · Fee tracking (records only, no payments) · Student portal +
promotions + PYQs · Rate limiting + security headers. Four dashboards:
`/admin`, `/teacher`, `/parent`, `/student` (+ `/login`, `/notifications`).

## Quick start (staging)

```bash
cp .env.example .env.local   # fill from Supabase staging dashboard, see docs/STAGING.md
npm install
npm run check:env            # presence-only check (names, never values)
npm run dev                  # http://localhost:3000
npm run typecheck && npm test && npm run lint && npm run build
```

## Project structure

```text
app/                  # Routes: pages + /api/v1/* handlers
  admin|teacher|parent|student # Role dashboards (UX gating only; API enforces)
  api/v1/             # REST handlers (auth + RBAC + tenant guard)
lib/
  auth/               # session, rbac matrix (single source of truth)
  config/             # safe env presence check (names only, no values)
  supabase/           # browser + server + admin (service-role) clients
  validation/         # Zod schemas shared by UI + API
  api/                # response envelope helpers
  tenant.ts           # tenant context (session-derived only)
supabase/migrations/  # Ordered SQL incl. RLS policies (0001–0012; do not edit)
docs/                 # ARCHITECTURE.md, DATABASE.md, API.md, STAGING.md, ...
scripts/              # check-env (safe), generate-openapi, generate-rls-tests
```
