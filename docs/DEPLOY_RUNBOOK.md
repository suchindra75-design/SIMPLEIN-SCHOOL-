# SIMPLEIN SCHOOL ERP — Go-live runbook

The owner-executable path from the current state to a safe production deploy.
Names only — **never put secret values in this file or in git.** For depth see
`PRODUCTION_DEPLOYMENT.md`, `BACKUP_AND_RECOVERY.md`, `PRODUCTION_AUTH_AUDIT.md`.

## Where the code stands (done by engineering)
- Canonical branch is **`main`** (27 migrations, all RLS / fee-integrity /
  audit work, spreadsheet-import DoS fix, migration 0027).
- Next.js **15.5.28** — critical RCE and the server-actions DoS closed;
  `npm run preflight` is green (typecheck, unit tests, audit gate, build).
- Deploy config: `vercel.json` pins functions to **Mumbai (`bom1`)**; `.nvmrc`
  pins **Node 22**; security headers, `/api/v1/health`, and fail-fast env
  errors are in place.

So the **code** is deploy-ready. The steps below are the account/infra work
that only the owner can do. Do them in order; do not skip step 1.

## Step 0 — Certify the build (local, 2 min)
```bash
npm ci
npm run preflight
```
Must end with “Preflight passed.” If not, stop and fix before continuing.

## Step 1 — Rotate the leaked credentials ⚠️ (do this first)
The staging service-role / anon / JWT keys, `ONBOARDING_SECRET`, and demo
passwords are in pushed git history (and on the `SSL` repo). Treat as
compromised.
1. Supabase dashboard → staging project → **Project Settings → API** →
   rotate JWT secret / migrate to new publishable + secret keys; revoke the
   old `service_role` and `anon` keys.
2. Reset every demo/staff account password that ever appeared in a script or
   `.env`; regenerate `ONBOARDING_SECRET` (`openssl rand -hex 32`).
3. Update the new values **only** in Vercel env and local `.env.local` — never
   in git.
4. (Recommended) scrub the secrets from git history (git filter-repo / BFG) on
   both repos and force-push; ask collaborators to re-clone.

## Step 2 — Stand up production Supabase (Mumbai)
1. Create / confirm the production project in **ap-south-1 (Mumbai)**.
2. Enable **PITR** and off-site backups; run one **restore drill**
   (`BACKUP_AND_RECOVERY.md`).
3. Apply migrations **0001–0027 in order** (run the read-only
   `scripts/sql/fee-integrity-precheck.sql` first if there is any existing
   data). Keep `private` **out of** the API “Exposed schemas”.
4. Run the pgTAP suites against it; all green.
5. Auth: **disable public sign-ups**, set Site URL to the production origin, and
   add **`https://<prod-origin>/auth/callback`** to the redirect allow-list
   (the password-reset link lands there). Configure **SMTP** — password reset
   does not send email without it. Enable MFA for admins.

## Step 3 — Wire Vercel production
1. Connect the `main` branch of the production repo to the Vercel project.
2. Set env vars (names from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only),
   `ONBOARDING_SECRET` (server-only), `NEXT_PUBLIC_APP_URL` (production origin).
3. Region is already `bom1` via `vercel.json`. Add the custom domain + DNS.

## Step 4 — First school
Create the first school via `POST /api/v1/onboarding/school` using the
`ONBOARDING_SECRET` bearer (see `PRODUCTION_DEPLOYMENT.md`). Do **not** seed
demo data into production.

## Step 5 — Deploy & smoke test
1. Push `main` (this triggers the Vercel production build/deploy).
2. `GET /api/v1/health` → `status: ok`.
3. Sign in to each portal (Admin, Teacher, Parent, Student); record a fee
   payment and verify it as a second admin; confirm cross-school isolation.
4. **Password reset end-to-end** (verifies the new flow — currently untested
   without SMTP): open `/forgot-password`, submit a known admin identifier →
   neutral "link sent" screen → open the email → it lands on `/auth/callback`
   and forwards to `/reset-password` → set a new password → sign in with it.
   Also confirm a non-existent identifier shows the **same** neutral screen (no
   account enumeration).

## Step 6 — Minimum operations
Error tracking (Sentry), uptime check on `/api/v1/health`, a Vercel log drain.

## Rollback
Vercel → Deployments → promote the previous good deployment. Migrations are
forward-only; restore via PITR if a migration caused data issues.

## Still open (tracked, not blockers for a first pilot)
- `zod` HIGH advisory accepted in the audit gate pending the zod v4 migration.
- Multi-school login (school code), online UPI fee collection, WhatsApp
  alerts, PWA — see the competitive audit roadmap.
