# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in SIMPLEIN SCHOOL ERP,
please report it privately. Do **not** open a public issue, and do not include
real student or payment data in your report.

- Email: security@simpleinsolutions.example  <!-- replace with a monitored inbox before launch -->
- Please include: a description, steps to reproduce, affected URL/endpoint, and
  the impact. Allow reasonable time for a fix before any public disclosure.

We aim to acknowledge reports within 3 business days.

## Supported versions

The `main` branch is the supported line. Security fixes are applied there and
released forward (migrations are forward-only).

## Handling of secrets

- No secrets are stored in this repository. Server secrets live only in the
  host/Vercel environment and local `.env.local` (git-ignored). See
  `.env.example` for the required variable names.
- If a credential is ever exposed, it is rotated and (where possible) purged
  from history. See `docs/DEPLOY_RUNBOOK.md` step 1.

## Known, tracked advisories

Production dependency advisories that are currently accepted (with reasons and a
review date) are listed in `scripts/audit-gate.mjs`; CI fails on any new
critical advisory or any unlisted high. See `docs/PRODUCTION_READINESS.md` §4.
