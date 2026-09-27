# SIMPLEIN SCHOOL ERP — Production Readiness (V1, Phase 13)

Status of what EXISTS, what is REQUIRED, and what is NOT yet done.
Nothing on this page claims a third-party service is configured unless it
actually is in your deployment.

---

## 1. Blockers (must fix before production)

1. **Live RLS verification.** All RLS policies are authored (migrations
   0002–0012) and service-boundary behavior is unit-tested (273 tests), but
   the policies have **never been executed against a real Postgres/Supabase
   instance**. Required: provision staging Supabase → apply all migrations →
   run `supabase/tests/phase2_rls.sql` … `phase12_rls.sql` as two tenants →
   fix any failures. See docs/SECURITY.md §4.
2. **Migrations have never been applied anywhere.** All 12 migration files
   exist but no environment runs them yet. Apply to staging first; verify
   order (0001 → 0012) and idempotency.
3. **Supabase Auth email delivery** must be configured (SMTP sender) for
   password-reset emails to work; not configured by this codebase.
4. **Content-Security-Policy** is not set (see SECURITY.md §14). Add a
   nonce-based CSP or an acceptable `unsafe-inline` policy decision before a
   public launch.

## 2. Required production environment variables

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon/publishable key (RLS still enforced) |
| `NEXT_PUBLIC_APP_URL` | public | canonical origin (used in emails/links) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Vercel env / never in the browser bundle |
| `ONBOARDING_SECRET` | **server-only** | `openssl rand -hex 32`; guards `POST /api/v1/onboarding/school` |

Secrets live in the Vercel project settings (and Supabase dashboard) — never
in Git. `.gitignore` excludes `.env*`; the repo contains names only.

## 3. Database backups — REQUIRED, not configured by this repo

- Supabase Pro provides **Point-in-Time Recovery (PITR)** — enable it on the
  production project. Free-tier daily logical backups are NOT sufficient for
  a school's financial/academic records.
- Additional recommended: nightly `pg_dump` to object storage (outside
  Supabase) with 30-day retention, and a **monthly restore drill** into a
  scratch project (a backup that has never been restored is untested).
- `audit_logs` is append-only; include it in every backup (it is the
  integrity trail for marks and fees).

## 4. File/storage backups — REQUIRED, not configured by this repo

- Supabase Storage buckets (student-photos, teacher-photos, report-cards,
  homework-attachments, notice-attachments, fee-receipts, pyqs) are NOT
  covered by database PITR. Required: scheduled sync of all objects under
  `schools/` to external storage (e.g. `rclone` cron or a storage-to-S3
  job), same retention as DB backups.
- Report-card PDFs are regenerable from data; receipts are not — treat
  fee-receipts as the most critical bucket.

## 5. Logging — partial

- Application errors are logged to `console.error` (server side) only.
- **Required:** ship Vercel runtime logs to a log platform (Vercel Log
  Drains → Datadog/Logtail/etc.). No PII is logged by design (ids and
  messages only) — keep it that way when adding logs.

## 6. Monitoring & error tracking — NOT configured

- **Required:** an error tracker (Sentry or equivalent) with the Next.js
  SDK wired into `app/` (source maps uploaded on deploy) and alerting on
  error-rate spikes.
- **Required:** uptime/availability monitoring on `GET /api/v1/health`
  (the implemented liveness probe) plus a synthetic login check.
- **Recommended:** Supabase database monitoring (connections, slow queries)
  and a monthly review of `audit_logs` volume anomalies.

## 7. Health checks — implemented

- `GET /api/v1/health` (unauthenticated liveness, JSON envelope) exists and
  is covered by the build. Point your uptime monitor at it.
- No deep health check (DB round-trip) exists yet; the session endpoint
  effectively serves that purpose for authenticated synthetic checks.

## 8. Deployment (Vercel + Supabase)

- `next build` passes; all routes are server-rendered or static as designed.
- Deploy flow: PR → CI (typecheck + tests + lint + build) → staging project
  → run RLS scripts → promote to production. Migrations are forward-only;
  every file is written to be idempotent (`IF NOT EXISTS` / exception guards).
- Framework security headers + rate limiting ship with the app
  (see SECURITY.md §13–14). HSTS applies to HTTPS production traffic.

## 9. Performance posture (audited, no premature optimization)

- All list endpoints paginate (cap 100); large imports are capped (200 rows /
  2 MB); notification fan-out is chunked (500) and batch-fetched (no N+1);
  fee summaries and notice feeds use batched queries (fixed in Phase 13).
- Indexes exist for every hot path (tenant-leading composites; badge query;
  section/day; student/session; section overlaps via unique indexes).
- Remaining known hot spots (acceptable at pilot scale, revisit at growth):
  per-page dashboard fan-outs are parallelized but numerous; attendance
  summary fetches up to 1000 records per student (bounded); in-memory rate
  limiting is per-instance (see SECURITY.md §13).

## 10. Pre-launch checklist

- [ ] Staging Supabase provisioned; all 12 migrations applied cleanly
- [ ] `phase2_rls.sql` … `phase12_rls.sql` executed green as two tenants
- [ ] Supabase Auth SMTP configured; password reset email received
- [ ] PITR enabled; storage sync scheduled; one restore drill completed
- [ ] Error tracker + uptime monitor live; alert routing verified
- [ ] `ONBOARDING_SECRET` rotated and stored only in server env
- [ ] CSP decision made and applied
- [ ] Smoke test per role: admin onboarding → login → each dashboard
