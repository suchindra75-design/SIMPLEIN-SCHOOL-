# SIMPLEIN SCHOOL ERP — Production Readiness

Status on 16 October 2026, branch `production-hardening` (based on
`release/erp-submission` at `bfb997a`). Every "verified" item below was
verified **locally** (isolated Supabase in Docker, production build). Nothing
here has been applied to, or tested against, a hosted Supabase project or
Vercel. Names only; no secret values appear in this repository.

Legend: **DONE (local)** implemented and tested locally · **NOT APPLIED**
ready but not on any hosted project · **NOT DONE** owner action required.

---

## 1. Mandatory before real school data

| # | Item | Status |
|---|------|--------|
| 1 | Rotate the exposed staging credentials: service-role/secret key, anon key, JWT secret if legacy keys are used, `ONBOARDING_SECRET`, staging user passwords. They are in pushed Git history (`90c1333`) and in the main checkout's `.env.local`. | NOT DONE |
| 2 | Confirm the production project. The CLI lists `rpcydhgavfebywhlfukp` ("simplin school production", ap-southeast-1), currently **paused**. Confirm, unpause, choose a plan with point-in-time recovery, take a backup and complete one restore drill (`docs/BACKUP_AND_RECOVERY.md`). | NOT DONE |
| 3 | Apply migrations `0016`–`0026` (staging first, then production), after running the read-only `scripts/sql/fee-integrity-precheck.sql` there and reviewing its findings. Without them: question papers are readable/writable across schools (0016), storage files are readable school-wide (0021), fee records can be altered by any admin (0022), buckets have no limits (0023), a paid assignment can be moved to another student (0024), audit entries can be forged and edited with the service-role key (0025), verified receipts can be swapped or deleted (0026). | NOT APPLIED |
| 4 | Fee maker-checker, assignment, receipt and audit integrity enforced by the database (migrations 0022, 0024–0026). Do **not** use the fee module with real data until they are applied to that database. | DONE (local) |
| 5 | Production Auth settings: Site URL and redirect allowlist set to the production URL; **public signups disabled** (accounts are provisioned by admins); SMTP only if password-reset e-mails are offered. | NOT DONE |
| 6 | Minimum operations: Vercel log drain or equivalent, uptime check on `GET /api/v1/health`, error alerting. | NOT DONE |

## 2. Implemented on `production-hardening` (verified locally)

- **Fee integrity (0022).** For any caller using the Supabase API with a user
  session: payments are recorded in the caller's own name, unverified, within
  the outstanding balance (row lock, so concurrent recordings cannot overpay);
  amount, date, mode, reference, assignment and recorder never change;
  verification happens once, in the verifier's own name, never by the
  recorder, never on a voided record, and cannot be removed; voiding is
  one-way, by another admin, with a reason; records cannot be deleted (also
  not by deleting the assignment or fee structure); an assignment's total
  cannot drop below what has been paid. Every change, on every path, writes an
  `audit_logs` row in the same transaction (`fee_payment.db_*`,
  `metadata.via`). The service-role key and direct database connections are
  exempt from the rules (trusted maintenance; the app never uses them for fee
  records) but are still audited — see `docs/DATABASE_TRUST_MODEL.md` for the
  exact scope. Rule violations use SQLSTATE `SF001` and are shown to users as
  readable messages.
  Tests: `supabase/tests/fee_integrity.sql` (42 assertions; 30 fail without
  the migration), `tests/integration/fee-integrity.test.ts`.
- **Fee assignment integrity (0024).** Once an assignment has any payment
  record, its student, fee structure and school cannot change through the
  API (the review's H1: one admin could move a verified payment to another
  student). Unpaid assignments keep their workflows. Every assignment change
  is audited (`fee_assignment.db_*`); payment and assignment creation times
  are set by the server. Race-free under READ COMMITTED (shared row lock;
  both orders tested with real overlapping sessions).
  Tests: `supabase/tests/fee_assignment_integrity.sql` (30; 16+ fail without
  0024), `tests/integration/fee-integrity.test.ts` (API + two race tests).
- **Audit log integrity (0025).** API appends cannot use database-reserved
  actions (`*.db_*`) or `metadata.via`, fee events only from admins, server
  time; UPDATE/DELETE/TRUNCATE of `audit_logs` refused for every role
  including the service-role key (the owner can still disable triggers —
  documented, not claimed otherwise). TRUNCATE revoked from anon and
  authenticated on all public tables.
  Tests: `supabase/tests/audit_integrity.sql` (26; 19 fail without 0025),
  `tests/integration/audit-integrity.test.ts`.
- **Verified receipt integrity (0026).** The receipt reference is frozen once
  a payment is verified or voided and must point at the payment's own
  folder; in Storage, receipts can be uploaded only into an unverified
  payment's folder, never overwritten or moved by a user session, and deleted
  only when no payment refers to them. The app checks first and explains.
  Tests: `supabase/tests/fee_receipt_integrity.sql` (29; 20 fail without
  0026), `tests/integration/fee-receipts.test.ts` (checks the stored bytes
  through the real Storage API, not only audit rows).
- **Storage bucket limits (0023).** Photos: 2 MiB, JPEG/PNG/WebP. Homework,
  notice, fee-receipt and question-paper buckets: 4,000,000 bytes, the app's
  document types. Report cards: 5 MiB, PDF. Tests: `storage_limits.sql`,
  `tests/integration/storage-limits.test.ts`, and a unit test that the
  migration matches the app's validator lists.
- **Upload budget vs Vercel's 4.5 MB request limit** (`lib/uploads/limits.ts`):
  all files in one request together ≤ 4,000,000 bytes, server-action body limit
  4,262,144 bytes (budget + 256 KiB multipart reserve). Enforced in the browser
  (SmartForm blocks the submit with a message), in the question-paper action
  and API route (combined budget), and in every upload API route, which read
  the body through `readFormDataWithinLimit`: a declared `Content-Length`
  over the limit is refused unread, and a chunked body without one is
  counted as it streams and no longer read past the limit (413
  `PAYLOAD_TOO_LARGE`). Server actions are limited by Next.js itself
  (`bodySizeLimit`). A unit test multipart-encodes a full-budget three-file
  request and checks it fits. Uploaded PDFs, images and DOCX/XLSX must start
  with their format's signature, and HTML/SVG/XML and script/executable
  extensions are refused. Storage rejections (size, type, permission,
  duplicate) are shown as readable messages.
- **Safe error messages** (`lib/errors/public-error.ts`, `server-log.ts`):
  server actions, pages, import/promotion results and API routes show only
  messages the app writes; anything else becomes "Something went wrong…
  (Reference: ABC123)" and the server logs one JSON line with the reference,
  error name, database code and a redacted message (no quoted values, e-mails,
  phone-like numbers, details or hints). Database and Storage errors carry
  only the redacted text, so Next.js's own report of an uncaught error does
  not print submitted values either. Three server actions that still returned
  raw database messages now use the same mapping.
- **Login page / portals.** The "DEV MODE: UNIFIED" badge shows only on local
  hosts. Portal links and redirects never echo an untrusted `Host` header:
  hosts configured in `NEXT_PUBLIC_APP_URL` / the portal URLs and Vercel's own
  deployment hosts (`VERCEL_URL`, `VERCEL_BRANCH_URL`,
  `VERCEL_PROJECT_PRODUCTION_URL`) stay on their origin; any other host is
  sent to `NEXT_PUBLIC_APP_URL`. **Set `NEXT_PUBLIC_APP_URL` in production**,
  and add every extra domain one deployment serves as a configured URL.
  Same-host portal switches do not loop.
- **Student import (xlsx/csv).** A gate (`lib/uploads/spreadsheet.ts`) runs
  before the parser: `.csv`/`.xlsx` only (legacy `.xls` dropped), the content
  must match the name (the parser otherwise picks XLS/HTML/DBF/… parsers by
  content), CSV must be plain text, and every ZIP entry is decompressed by
  the gate with a hard cap — at most 100 parts and 10,000,000 bytes in total,
  no encryption/ZIP64/comments/trailing data/inconsistent headers — so
  declared sizes are never trusted. Then only the first sheet, header plus
  201 rows, without formulas/HTML/styles, is parsed. Measured (local, child
  process, 256 MB heap cap): a 48 MB-expanding bomb is refused in 16 ms; the
  largest accepted workbooks (≤ 2 MB upload, ≤ 10 MB expanded, ~20,000 rows)
  parse in ≤ 250 ms at ~105–120 MB peak RSS. The parser's own advisories
  (prototype pollution, ReDoS) remain until it is replaced (§4).
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, unit tests, production
  dependency audit gate (`scripts/audit-gate.mjs`: fails on any critical, on
  any high advisory not listed with a reason and review date, and when the
  audit cannot run), build; and a second job that starts a throwaway local
  Supabase on the runner and runs pgTAP, the seed and the integration tests.
  Read-only token, checkout without persisted credentials, job timeouts,
  superseded runs cancelled. Actions are pinned by major tag, not by commit
  SHA (needs the SHAs looked up on GitHub). Not yet executed on GitHub
  (nothing has been pushed).

## 3. Environment variables (names only)

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Production project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon/publishable key (RLS enforced) |
| `NEXT_PUBLIC_APP_URL` | public | canonical origin |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | never `NEXT_PUBLIC_*`; verified absent from the browser bundle and build output |
| `ONBOARDING_SECRET` | **server-only** | new random value per environment; rotate after onboarding |
| `NEXT_PUBLIC_STAFF_PORTAL_URL`, `NEXT_PUBLIC_FAMILY_PORTAL_URL` | public, optional | only for split staff/family subdomains; leave unset on a single domain |

## 4. Dependencies

| Package | Finding | Plan |
|---------|---------|------|
| `next` 15.5.26 | 2 moderate (cache poisoning, self-hosted SSG/ISR; the app is dynamic and on Vercel) | Upgrade to 15.5.28 (same minor; also allows `sharp` 0.35.5). Needs approval to download; then run all suites. |
| `postcss` 8.4.31 (pinned by `next`) | high, build-time only (first-party CSS) | Fixed only by a Next major; accept for now. |
| `sharp` 0.35.4 | high, image processing | Not used at runtime (no `next/image`); resolved by the `next` upgrade. |
| `source-map-js` 1.2.1 | high, build-time | `npm update source-map-js` (1.2.2) with approval. |
| `xlsx` 0.18.5 | high (prototype pollution, ReDoS), admin-only; input now bounded by the import gate (content check, ≤ 10 MB expanded, first sheet only) | Replace with the SheetJS CDN build 0.20.3 (download approval) or a CSV-only importer. Accepted in `scripts/audit-gate.mjs` until 2026-11-30. |
| `vitest` & tooling | critical, dev-only (not deployed) | Major upgrade later; not a production risk. |

## 5. Remaining risks (not blockers for a pilot, track them)

- Rate limiting is in-memory per server instance; the login limit (30 per 5
  min per IP) can lock out a school lab behind one address.
- No `maxDuration` on long operations (bulk report cards, promotions, import);
  a timeout can leave a batch partly done.
- No Content-Security-Policy header yet (SECURITY.md §14).
- Login response time differs for unknown identifiers (identifier
  enumeration); `createUserAction` relies on Supabase's password minimum.
- PDFs replace non-Latin characters with "?" (names in Indic scripts).
- PostgREST `max_rows` (1000 locally) silently caps very large reads.
- The fee rules exempt the service-role key and direct DB access by design;
  protect those credentials (they are also audited). The audit triggers stop
  the service-role key but not the database owner (`docs/DATABASE_TRUST_MODEL.md`).
- Document uploads still accept legacy `.doc`/`.xls` (macro-capable). Dropping
  them (and limiting fee receipts to PDF/images) is a compatibility decision
  for the owner.
- The xlsx parser's ReDoS/prototype-pollution advisories are bounded, not
  removed, by the import gate.
- CI actions are pinned by tag; pin by commit SHA after looking them up.

## 6. Pre-launch checklist

- [ ] Section 1 items 1, 2, 5, 6 done by the owner
- [ ] `scripts/sql/fee-integrity-precheck.sql` run on staging and production; findings resolved
- [ ] `0016`–`0026` applied to staging; `supabase test db`-equivalent suites green there; per-role smoke test
- [ ] `0016`–`0026` applied to production after a backup; migration history matches
- [ ] Buckets private with limits (`select id, public, file_size_limit from storage.buckets`)
- [ ] `next` 15.5.28 upgrade (and xlsx decision) tested and merged
- [ ] CI green on GitHub for the release branch
- [ ] Vercel production env set (section 3); deploy; health, per-role login, upload and fee checks
- [ ] First real school onboarded through `ONBOARDING_SECRET`; secret rotated; no demo data present
