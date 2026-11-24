# SIMPLEIN SCHOOL ERP — Production Readiness Assessment

**Date:** 2026-11-01 · **Branch:** `main` (= `production-hardening`) @ `9bf1ee7` ·
**Assessor:** engineering (Claude Code)

**Classification legend:** `VERIFIED` (tested by me this cycle) · `IMPL-UNVERIFIED`
(exists in code, not runtime-tested by me) · `PARTIAL` · `NOT-IMPL` ·
`BLOCKED-EXT` (needs an external account/credential).

**Method & constraints.** Read-only audit of the full repo, plus the test runs in
§H. The existing UI was **not changed** (brief §1). Schoolites was **not logged
into**: signing into a third-party service with the demo password is outside what
I may do, so the benchmark (§B/§C) is built from the owner-supplied competitive
audit (`SIMPLEIN_ERP_Audit_Report.docx`), Schoolites' public pages, and the
Simplein codebase. pgTAP + integration suites were **not run locally** (Docker
not running); they run in CI on every push.

---

## A. What was already implemented (baseline)

| Area | Status | Evidence |
|---|---|---|
| Multi-tenant core: `school_id` on every table, RLS enabled on 36 tables, 121 policies, 44 SECURITY DEFINER helpers | `IMPL-UNVERIFIED` (unit/pgTAP cover it; not runtime-tested by me) | `supabase/migrations/*` |
| Academic loop: students, classes/sections/subjects, attendance, exams, marks, grading, report-card PDFs, timetable (clash-proof via DB constraints), homework | `IMPL-UNVERIFIED` | `app/*`, `lib/services/*`, 475 unit tests |
| Fees: structures/components/concessions, dues, payment records (cash/cheque/bank/other), maker-checker verify/void, receipts | `PARTIAL` (records-only; no online collection) | `lib/services/fees.ts`, `migrations 0022/0024/0026` |
| Fee integrity: no overpayment, maker≠checker, one-way void, receipts frozen after verify, append-only audit | `IMPL-UNVERIFIED` (pgTAP + integration in CI) | `migrations 0022–0027` |
| Parent & student portals (web): attendance, exams, results, report cards, fees (read-only), homework, notices, timetable, PYQs | `IMPL-UNVERIFIED` | `app/parent/*`, `app/student/*` |
| Auth & RBAC: session, role layouts, tenant scope, host-based portal routing | `IMPL-UNVERIFIED` | `lib/auth/{session,rbac,scope,portal}.ts`, `middleware.ts` |
| Rate limiting (tiered, in-memory) | `VERIFIED` (unit) / `PARTIAL` (per-process only) | `lib/security/rate-limit.ts` |
| Storage: 7 buckets w/ size+MIME limits, record-scoped signed URLs, hardened spreadsheet import | `VERIFIED` (unit) | `lib/uploads/*`, `migrations 0021/0023` |
| CI: typecheck, lint, test, audit gate, build, pgTAP, integration | `VERIFIED` (file reviewed; runs in CI) | `.github/workflows/ci.yml` |

Metrics (current `main`): 98 API routes · 27 migrations · 35 tables · 121 RLS
policies · 44 SECURITY DEFINER · 13 Zod validation modules · 18 pgTAP suites ·
44 test files.

## B. What was inspected in Schoolites

Via the owner's competitive audit + public pages (`schoolites.com/{pricing,
services,integrations,download-app}`) — **no login performed**. Observed/advertised:
46 modules (admissions CRM, transport, hostel, library, inventory, payroll
PF/ESI/TDS, UDISE+, CCTV, multi-branch, LMS), 27 integrations (Razorpay/PhonePe/
Stripe/Cashfree/Easebuzz, ZKTeco/eSSL biometrics, WhatsApp/MSG91/Twilio, GPS),
native iOS/Android apps, AI assistant "Genie", online payment gateway, indicative
₹15/student/month. (Credibility caveats noted in the audit; benchmark is
**functionality, not marketing claims**.)

## C. Schoolites vs Simplein — feature comparison

| Feature | Schoolites | Simplein status | Gap | Backend/DB need | Recommended | Testing |
|---|---|---|---|---|---|---|
| Core academics (attendance/exams/marks/report cards) | yes | `IMPL-UNVERIFIED` | none | — | keep | portal smoke + unit |
| Timetable (clash-free) | yes (+AI sub) | `IMPL-UNVERIFIED` | AI substitution | — | keep; AI later | unit |
| Fee records + controls + audit | yes | `IMPL-UNVERIFIED` | none (strong) | — | keep | pgTAP/integration |
| **Online fee collection (UPI/cards)** | yes | `NOT-IMPL` | the #1 buyer feature | payments table, gateway webhooks, idempotency | Razorpay/PhonePe + UPI mode | payment + idempotency tests |
| **Defaulter report** | yes | `NOT-IMPL` | — | read query on dues | admin report page (existing patterns) | query unit test |
| **WhatsApp/SMS/email/push alerts** | yes | `NOT-IMPL` (in-app only) | parent engagement | notification queue + provider | WhatsApp API + SMTP | delivery tests |
| **Installable app (PWA/native)** | native apps | `NOT-IMPL` (responsive web) | — | manifest + service worker | PWA first | lighthouse/install |
| **Admissions/enquiry CRM** | yes | `PARTIAL` (admission no. only) | pipeline | enquiry/application tables | staged pipeline | unit + RLS |
| Leave workflow; staff attendance | yes | `PARTIAL` / `NOT-IMPL` | approvals | leave/attendance tables | workflow | unit + RLS |
| Certificates (TC/bonafide), ID cards | yes | `NOT-IMPL` | — | templates + PDF | pdf-lib (reuse) | render test |
| Transport / Library / Hostel / Inventory | advertised | `NOT-IMPL` | breadth | per-module schema | on demand only | per module |
| Payroll (PF/ESI/TDS) | advertised | `NOT-IMPL` | statutory | large | defer | — |
| Analytics dashboards + exports | advertised | `PARTIAL` (counts) | KPIs | aggregate queries | collections/dues/attendance KPIs | query tests |
| Multi-school login (school code) | yes | `PARTIAL` (per-school unique IDs, no school context) | duplicates can't log in | login resolution | school code/subdomain + OTP | auth tests |
| Biometric / GPS / CCTV | via integrations | `NOT-IMPL` | — | device integrations | partner add-ons later | — |

## D. What I changed (this cycle) — files + commits

All on `main`, **not pushed**. UI unchanged.

| Commit | Change | Files |
|---|---|---|
| `ac60025` | Spreadsheet-import DoS fix; receipt helpers → `private` schema | `lib/uploads/spreadsheet.ts(+test)`, `lib/services/imports.ts`, `migrations/0027`, `tests/…` |
| `beb75a2` | Import-gate docs; corrected overstated claims | `docs/*` |
| `d88bc69` | **Next.js 15.5.26→15.5.28** (critical RCE + HIGH DoS closed); `zod` advisory tracked | `package.json`, `package-lock.json`, `scripts/audit-gate.mjs` |
| `7d68f4e` | Vercel **Mumbai `bom1`** + **Node 22** | `vercel.json`, `.nvmrc` |
| `0e731e8` | **`npm run preflight`** gate + owner runbook | `scripts/deploy-preflight.mjs`, `package.json`, `docs/DEPLOY_RUNBOOK.md`, `.gitignore` |
| `9bf1ee7` | **CSP (Report-Only)** + `SECURITY.md` | `next.config.mjs`, `SECURITY.md` |

## E. Security improvements

- `VERIFIED` Critical **Next.js RCE** (GHSA-2464-fhr4-w9xw) + HIGH server-actions DoS closed via 15.5.28; audit `1 critical/5 high → 0 critical`.
- `VERIFIED` Spreadsheet-import **quadratic DoS** fixed (linear scanner, bounded); receipt policy helpers moved off the public API schema (`migration 0027`).
- `VERIFIED` **CSP** added (Report-Only, restricts `connect-src` to self+Supabase) + security headers already present (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy).
- `VERIFIED` `SECURITY.md` disclosure policy; `zod` HIGH tracked in the audit gate with review date.
- `IMPL-UNVERIFIED` Existing: RLS on 36 tables, server-side RBAC+tenant scope, Zod validation (13 modules), identifier lookups use exact `.eq()` (no filter injection), safe-redirect validation, append-only audit, fail-fast env in Supabase clients.
- **Secrets:** none in the repo (`.env*` git-ignored; `.env.example` is names-only). **Leaked staging keys remain in git history** (owner must rotate — §L).

## F. Database improvements / status

- `IMPL-UNVERIFIED` Migrations 0001–0027 sequential and consistent; RLS on 36 tables; FK/constraints and timetable clash prevention enforced in DB; fee maker-checker + append-only audit in DB triggers.
- `VERIFIED` (prior review) `migration 0027` moves SECURITY DEFINER receipt helpers to a `private` schema (not API-served), least privilege, pinned `search_path`.
- `BLOCKED-EXT` Fresh-install + upgrade verification and pgTAP run require the Supabase Docker stack (not run this cycle; CI runs them). Backups/PITR/restore drill are owner actions on the hosted project.

## G. Performance improvements

- `VERIFIED` Functions pinned to **Mumbai (`bom1`)** — removes the audit's ~150–250 ms/query US-East penalty for Indian users.
- `IMPL-UNVERIFIED` Build output healthy (shared JS ~103 kB; per-route 1–2 kB). No N+1/index audit performed this cycle (requires the DB stack + query profiling) — `NOT-IMPL` for a formal pass.

## H. Tests executed — actual results (this cycle)

| Test | Result |
|---|---|
| TypeScript typecheck (`tsc --noEmit`) | **PASS** (0 errors) |
| Lint (`eslint .`) | **PASS** (0 errors; 1 warning in `finalfrontendsimp-main/` prototype folder, not the app) |
| Unit tests (`vitest run`) | **PASS — 475/475**, 35 files |
| Production build (`next build`) | **PASS** (compiled successfully) |
| Dependency audit gate | **PASS** (0 critical; highs accepted/build-time/mitigated) |
| `npm run preflight` (all of the above in sequence) | **PASS** |
| pgTAP (`supabase test db`) | **NOT RUN locally** (Docker down) — runs in CI |
| Integration tests | **NOT RUN locally** (Docker down) — runs in CI |
| Portal-by-portal runtime smoke (4 portals, mobile) | **NOT RUN** (needs local Supabase + seed, or staging) |

## I. Features still incomplete

`NOT-IMPL`: online fee collection (UPI/gateway), defaulter report, WhatsApp/SMS/
email/push, installable PWA, certificates/ID cards, transport/library/hostel/
inventory/payroll, analytics dashboards+exports, enforced nonce-CSP.
`PARTIAL`: admissions pipeline, leave workflow, staff attendance, multi-school
login (school code/OTP), **password reset/recovery (none exists — a real gap)**.

## J. External account requirements (`BLOCKED-EXT`)

Payment gateway merchant account (Razorpay/PhonePe) · WhatsApp Business API ·
SMTP provider · Upstash Redis (shared rate-limit store) · Sentry (errors) ·
uptime monitor · domain/DNS · Supabase production project (Mumbai).

## K. Deployment blockers

1. Leaked credentials not rotated (in git history) — **highest**.
2. No production Supabase project / no backups / migrations not applied to a hosted DB.
3. No production Vercel env; the stated public URL 404s.
4. Password reset depends on SMTP (not configured) — users can't self-recover.

## L. Exact remaining owner actions

1. **Rotate** Supabase staging service-role/anon/JWT keys, `ONBOARDING_SECRET`, demo passwords; update Vercel env; (recommended) scrub git history.
2. **Create Mumbai Supabase** (`ap-south-1`): PITR + backups + restore drill; apply migrations 0001–0027; disable public signups; set redirect allowlist; configure **SMTP**.
3. **Vercel**: production env vars + custom domain (region set).
4. **Authorize** the push of `main` (triggers deploy) + a go-live smoke test.

(Full steps with commands: `docs/DEPLOY_RUNBOOK.md`.)

## M. Final production-readiness assessment

**The ERP is NOT production-ready for real schools yet** — and `npm run preflight`
passing does **not** change that. What is true:

- **Code / build readiness:** `VERIFIED` ready (tests green, 0 critical vulns, builds, UI preserved).
- **Security architecture:** strong (`IMPL-UNVERIFIED` at runtime) — RLS, RBAC, fee integrity, audit, validation, rate limiting.
- **Deployment readiness:** `BLOCKED` — on owner infra (rotation, Mumbai DB, backups, Vercel env) and on password reset (SMTP).
- **Functional completeness for a real school:** `PARTIAL` — the academic loop and fee *controls* are done, but the **table-stakes commercial features are missing** (online fee collection, parent messaging, password recovery, installable app).

**Verdict:** a well-engineered, secure core that is **deploy-ready as code** but
**not yet a shippable product**. Minimum to pilot with a real school: clear §K
blockers, add **password reset**, **online fee collection + defaulters**, and
**parent notifications**. Recommended order in `docs/DEPLOY_RUNBOOK.md` and the
competitive-audit roadmap.
