# SIMPLEIN SCHOOL ERP — CI/CD & Release Management (V1, Phase 15)

Status: `.github/workflows/ci.yml` exists (branch `production-hardening`;
not yet run on GitHub because nothing has been pushed). It runs on pushes to
`main`, `release/**`, `production-hardening`, `phase-16-production-infrastructure`
and on pull requests to `main` / `release/**`, with read-only permissions.

## 1. Pipeline

Job `validate` (placeholder env values, never real secrets):

1. `npm ci`
2. `npm run typecheck`, `npm run lint`, `npm test`
3. `npm audit --omit=dev --audit-level=critical` (known high advisories are
   tracked in `docs/PRODUCTION_READINESS.md` §4)
4. `node scripts/check-env.mjs`, `npm run build`

Job `database` (throwaway local Supabase in Docker on the runner):

1. `supabase start` (only Auth, PostgREST, Postgres, Storage, Kong)
2. `supabase test db` — every migration + all pgTAP suites, including
   `fee_integrity.sql` and `storage_limits.sql`
3. seed (`scripts/seed-local.mjs`, localhost-only) + `npm run test:integration`
4. `supabase stop --no-backup`

Required before production deploys (manual today): staging migrate + live
checks, human approval, then production migrate (forward-only) and deploy.

## 2. Migration promotion

- Migrations travel with the code change that needs them (same PR).
- Staging applies first (`supabase db push --linked` against staging);
  production applies the identical files, same order, forward only.
- Verify with `supabase migration list` on both environments after apply.
- Never edit a migration that has run on staging or production — fix
  forward with a new numbered file.

## 3. Release tagging

- Tag releases on `main` after staging verification: `vMAJOR.MINOR-<stage>`.
- Existing precedent: `v1.0-staging-verified` (staging E2E green).
- Production releases get their own tag only AFTER the production smoke
  test passes (see `docs/PRODUCTION_DEPLOYMENT.md` §4.8).

## 4. Deployment approval

- Staging → production requires explicit human approval (owner: TBD —
  product/engineering lead). Record approver + timestamp with the release.
- No direct pushes to production paths; no dashboard-only hotfixes without
  a matching code change merged afterward.

## 5. Rollback

- App: redeploy the previous Vercel deployment (instant).
- Database: forward-neutralize additive-only mistakes; otherwise restore
  from backup (see `docs/BACKUP_AND_RECOVERY.md` §6 in
  `docs/PRODUCTION_DEPLOYMENT.md` — restores are pre-launch blockers
  precisely because V1 has no down-migrations).

## 6. Hotfix flow

1. Branch from the production tag (`hotfix/<issue>`).
2. Minimal fix + regression test (unit or pgTAP, proving the defect).
3. Fast-track the §1 gates (all four commands still mandatory).
4. Staging verify → approval → production deploy + migrate → re-tag
   (`vX.Y.Z-hotfix.N`).
