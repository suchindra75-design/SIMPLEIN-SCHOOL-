# SIMPLEIN SCHOOL ERP — CI/CD & Release Management (V1, Phase 15)

Status: NO CI pipeline exists (verified: no `.github/workflows`, no CI
config in `package.json`). The flow below is REQUIRED before production;
until it exists, releases are manual and must still follow the gates.

## 1. Required pipeline (per pull request)

```
feature branch
  → pull request
    → npm run typecheck
    → npm run lint
    → npm test            (currently 289 tests; tenant/RBAC suites block merges)
    → npm run build
    → deploy preview (Vercel)
    → staging deploy + migrate + live RLS suites green
    → human approval
    → production deploy + migrate (forward-only)
```

Minimum CI job (GitHub Actions example shape — create
`.github/workflows/ci.yml` when CI is adopted):

1. Checkout + Node 20+ + `npm ci`.
2. `npm run typecheck && npm run lint && npm test && npm run build`.
3. Fail the PR on any red step. Tenant/RBAC test files block merges on
   failure (see testing strategy in `docs/ARCHITECTURE.md` §15).

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
