# SIMPLEIN SCHOOL ERP — Production Deployment (V1, Phase 15)

How to run separate environments and ship to production. Companion to
`docs/ARCHITECTURE.md` (design), `docs/SECURITY.md` (posture),
`docs/BACKUP_AND_RECOVERY.md`, `docs/MONITORING.md`, `docs/CI_CD.md`.
No secrets in this file — names only.

## 1. Environments

| Concern | Development | Staging | Production |
|---------|-------------|---------|------------|
| Supabase project | dev project (or CLI-linked staging for DB work) | `simplein school` (ap-northeast-2) | **separate new project — NOT created** |
| Database | dev/staging PG | staging PG (migrations 0001–0015 applied) | new PG, forward migrations only |
| App hosting | `npm run dev` (localhost) | staging Vercel project | production Vercel project |
| App URL | `http://localhost:3000` | staging URL | production URL (TBD) |
| Secrets | local `.env.local` only | staging Vercel env | production Vercel env (different values) |
| Data | synthetic only | synthetic only | real school data (pilot onboarding) |

Rules: never reuse a secret across environments; never copy production data
down without anonymization; never apply a migration anywhere it has not been
reviewed (see §5).

## 2. Required environment variables

| Variable | Scope | Required in | Notes |
|----------|-------|-------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | all | Supabase project URL (per-environment value) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | all | anon/publishable key (RLS still enforced) |
| `NEXT_PUBLIC_APP_URL` | public | all | canonical origin (links, emails, redirects) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | all | Vercel env only; never in browser bundle or Git |
| `ONBOARDING_SECRET` | **server-only** | all | `openssl rand -hex 32` per environment; guards onboarding |

Public (`NEXT_PUBLIC_*`) values ship in the browser bundle by design — they
are identifiers, not secrets. The service-role key and onboarding secret must
exist ONLY in server env (local `.env.local`, Vercel project settings).

## 3. Deployment sequence (per environment)

1. Provision Supabase project (§4 for production) + Vercel project.
2. Set the §2 variables (per-environment values).
3. Apply migrations forward (`supabase db push --linked` or CI equivalent).
4. Verify migration history matches (`supabase migration list`).
5. Deploy app (`vercel --prod` or Git-connected deploys).
6. Smoke test: `/api/v1/health` → 200; login per role; dashboard per role.
7. Onboard first school via `ONBOARDING_SECRET`; rotate the secret after pilot
   onboarding if it was ever shared.

## 4. Production Supabase setup procedure (project NOT created)

1. **Create production Supabase project** (new project, production tier for
   PITR — see `docs/BACKUP_AND_RECOVERY.md`). Record URL + keys into
   production Vercel env only.
2. **Configure Auth:** enable email confirmations; set site URL + redirect
   allow-list to the production app URL; review password requirements;
   configure SMTP sender (REQUIRED for password-reset emails — unconfigured
   anywhere as of Phase 15).
3. **Configure Storage:** buckets are created by migrations (private); verify
   `public = false` on all 7 buckets after migrate (see §6).
4. **Apply migrations 0001 → latest, forward-only** (§5). Never edit a
   migration that has run anywhere; fix forward with a new file.
5. **Verify migration history** (`supabase migration list` — local and remote
   revisions must match exactly).
6. **Run live RLS suites** (`supabase/tests/phase*_rls.sql`, currently 12
   files; `supabase test db` needs Docker, otherwise `db query -f` per file).
   All must pass: 282+ assertions at Phase 15.
7. **Verify private buckets** (`select id, public from storage.buckets` —
   all false) **and required indexes/triggers** (unique, immutability, tenant
   triggers ship inside each migration).
8. **Production smoke test:** health, per-role login, per-role dashboard,
   one attendance save, one marks→publish→report-card cycle on synthetic
   data; then delete synthetic rows before pilot onboarding.

## 5. Production migration process

- Migrations are append-only files in `supabase/migrations/` (`NNNN_name.sql`).
- Every migration must be idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`
  before `CREATE`) and re-runnable; RLS policies ship in the same file as
  their tables.
- Apply in numeric order, forward only. No down-migrations in V1.
- **Staging gate (must pass before production migration):** `npm run
  typecheck`, `npm test`, `npm run lint`, `npm run build`, all live RLS
  suites green on staging, OpenAPI regenerated (`scripts/generate-openapi.mjs`).

## 6. Rollback process

- **App:** redeploy the previous Vercel deployment (instant rollback; Vercel
  keeps every deployment). Tag the release first (see `docs/CI_CD.md`).
- **Database:** V1 has no down-migrations. Rollback = restore from backup
  (see `docs/BACKUP_AND_RECOVERY.md`) — this is why PITR + restore drills are
  pre-launch blockers. A bad migration that only ADDS objects (table, policy,
  index) can alternatively be neutralized forward (new migration dropping or
  fixing the object); a bad migration that ALTERs shared semantics requires
  restore. When in doubt, restore.
- **Promotion flow:** `main` → staging (verify §5 gate) → approval →
  production deploy + migrate. Hotfixes follow the same path, expedited
  (see `docs/CI_CD.md`); never patch production directly.
