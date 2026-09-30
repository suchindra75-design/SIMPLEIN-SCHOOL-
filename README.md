# SIMPLEIN SCHOOL ERP (V1)

Multi-tenant school ERP by **SIMPLEIN SOLUTIONS LLP** — School Admin ↔
Teachers ↔ Parents. V1 has no online payments (fee tracking is display +
staff-recorded receipts only).

## Status

**V1 staging-verified (`v1.0-staging-verified`).** All feature modules
implemented; live RLS verified (282+ pgTAP assertions, phases 2–12) and
runtime E2E verified (all four roles, workflows, storage, fees, PYQs).
Migrations 0001–0015 applied on staging. Production project NOT created;
see deployment docs before any launch. See:

- `docs/SYSTEM_ARCHITECTURE.md` — guide-structured map (context, diagrams, controls, traceability)
- `docs/ARCHITECTURE.md` — stack, multi-tenancy, auth/RBAC, security, roadmap (§16–§27 per-phase notes)
- `docs/DATABASE.md` — entities, relationships, RLS pattern
- `docs/API.md` — REST contract (`/api/v1/*`, 129 operations; generated spec in `docs/openapi.yaml`)
- `docs/STAGING.md` — staging env wiring + fail-closed behavior + smoke test
- `docs/STAGING_E2E.md` — Phase 14 validation record
- `docs/PRODUCTION_DEPLOYMENT.md` — environments, prod setup, promotion, rollback
- `docs/BACKUP_AND_RECOVERY.md` — backup/restore (required, not configured)
- `docs/MONITORING.md` — monitoring (not configured)
- `docs/CI_CD.md` — release flow (no pipeline yet)
- `docs/DATA_GOVERNANCE.md` — data categories, retention TBD
- `docs/RISK_REGISTER.md` — risks + post-baseline ADRs
- `docs/PRODUCTION_READINESS.md` — blockers checklist
- `docs/SECURITY.md` — implemented posture + known limitations

Implemented: Auth + users/onboarding · People + Excel import · Attendance ·
Exams · Marks/grades · Report cards + PDF · Timetable · Homework · Notices +
notifications · Fee tracking (records only, no payments) · Student portal +
promotions + PYQs · Rate limiting + security headers. Four dashboards:
`/admin`, `/teacher`, `/parent`, `/student` (+ `/login`, `/notifications`).

## Environments (dev → staging → production)

- **Development:** `npm run dev` + dev Supabase project (or local), synthetic data only.
- **Staging:** linked `simplein school` project; synthetic data only; verify via `docs/STAGING.md`.
- **Production:** NOT created. Separate project/database/secrets/URL required —
  see `docs/PRODUCTION_DEPLOYMENT.md`. Never copy production data down without
  anonymization; never reuse secrets across environments.

## Quick start (development/staging)

```bash
cp .env.example .env.local   # fill from the dashboard of YOUR environment, see docs/STAGING.md
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
  config/             # safe env presence check (names only, no values) + env status
  security/           # rate limiting (per-IP tiers)
  supabase/           # browser + server + admin (service-role) clients
  validation/         # Zod schemas shared by UI + API
  api/                # response envelope helpers
  tenant.ts           # tenant context (session-derived only)
supabase/migrations/  # Ordered SQL incl. RLS policies (0001–0015; do not edit applied files)
docs/                 # architecture, deployment, operations, risks (see Status links)
scripts/              # check-env (safe), generate-openapi, generate-rls-tests
```
