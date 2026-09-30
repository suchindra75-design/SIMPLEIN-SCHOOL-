# SIMPLEIN SCHOOL ERP — Monitoring & Observability (V1, Phase 15)

Status: NOT configured. This document defines what must exist before
production. Nothing below claims an error tracker, dashboard, or alert
exists — see Status column.

## 1. What to monitor

| Signal | Source | Status |
|--------|--------|--------|
| Liveness | `GET /api/v1/health` (unauthenticated, JSON envelope) | Probe EXISTS; no monitor points at it |
| Authenticated depth | `GET /api/v1/auth/session` with a synthetic session | Not configured |
| API errors (5xx rate, spike) | App runtime logs / error tracker | NOT configured |
| Auth failures (401/403 bursts — attack signal) | App runtime logs | NOT configured |
| Database errors / slow queries | Supabase DB monitoring | NOT configured |
| Storage failures (upload/download errors) | App runtime logs | NOT configured |
| Application exceptions (uncaught, route `INTERNAL`) | Error tracker (Sentry or equivalent) | NOT configured |
| Uptime (external, multi-region if possible) | Uptime monitor | NOT configured |
| Security events (RLS violations spike, onboarding 403s, disable/enable) | `audit_logs` volume anomalies + runtime logs | Manual review only |

## 2. Error tracking (required)

- SDK (Sentry or equivalent) wired into the Next.js app with source maps
  uploaded on deploy; alert on error-rate spikes.
- Server responses already use the safe envelope (`{ error: { code,
  message } }`, no stack/SQL leaks) — keep it that way; details go to the
  tracker + server logs only. Never log passwords, marks dumps, or tokens.

## 3. Uptime monitoring (required)

- Check `GET /api/v1/health` every 1–5 min from outside the hosting region;
  alert on 2 consecutive failures.
- Add one authenticated synthetic check (login as a canary staging user →
  `/api/v1/auth/session` → logout) to catch auth/session regressions the
  liveness probe cannot see. Use a dedicated canary account, never a real
  staff account.

## 4. Log centralization (required)

- Ship Vercel runtime logs to a log platform (Vercel Log Drains →
  Datadog/Logtail/etc.) with ≥30-day retention.
- PII minimization is already the design (ids and messages only — see
  `docs/SECURITY.md`); preserve it in every new log line. Review: `console`
  usage in `lib/` and `app/` must never include secrets, passwords, marks,
  or tokens.

## 5. Alert ownership & escalation (TBD — requires approval)

| Alert | Owner | Channel | Escalation |
|-------|-------|---------|------------|
| Uptime down | TBD (on-call engineer) | TBD (PagerDuty/SMS) | TBD |
| Error-rate spike | TBD | TBD | TBD |
| Auth-failure burst | TBD (security contact) | TBD | TBD |
| Storage/DB errors | TBD | TBD | TBD |

Fill Owner/Channel/Escalation before pilot. Until then, monitoring gaps
remain a pre-launch blocker (see `docs/PRODUCTION_READINESS.md`).
