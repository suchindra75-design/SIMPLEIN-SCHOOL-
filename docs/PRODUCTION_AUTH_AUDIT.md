# SIMPLEIN SCHOOL ERP — Phase 16 Production Auth Configuration Audit

**Project Name:** SIMPLEIN SCHOOL ERP (V1)  
**Organization:** SIMPLEIN SOLUTIONS LLP  
**Repository Path:** `/Users/apple/SIMPLEIN-SCHOOL-`  
**Git Branch:** `phase-16-production-infrastructure`  
**Production Supabase Project:** `simplin school production` (Ref: `rpcydhgavfebywhlfukp`, Region: `ap-southeast-1`)  
**Audit Timestamp:** `2026-10-01T19:18:00+05:30`  
**Audit Scope:** Read-Only Verification of Application Auth Expectations & Production Supabase Auth Settings  

---

## 1. EXECUTIVE SUMMARY & AUDIT OBJECTIVE

This document records the **Read-Only Authentication Audit** for the SIMPLEIN SCHOOL ERP production deployment. 

The audit evaluates two distinct layers:
1. **APPLICATION AUTH IMPLEMENTATION:** How the Next.js 15 application codebase, SSR middleware, session resolution engine, RBAC matrix, and server actions handle credentials, cookies, tokens, routing, and access control.
2. **PRODUCTION SUPABASE AUTH CONFIGURATION:** The live configuration of the linked production Supabase project (`rpcydhgavfebywhlfukp`), identifying all configuration discrepancies and operational gaps prior to public pilot launch.

---

## 2. APPLICATION AUTH IMPLEMENTATION `[VERIFIED]`

The application's authentication architecture was inspected across `lib/auth/session.ts`, `lib/auth/rbac.ts`, `middleware.ts`, `lib/config/env.ts`, `lib/supabase/*`, `app/auth-actions.ts`, and `app/login/*`.

| Dimension | Application Implementation / Specification | Evidence / Location | Status |
| :--- | :--- | :--- | :--- |
| **1. Auth Provider** | **Email + Password only.** Passwords are owned and hashed by Supabase (bcrypt); the application database NEVER stores, hashes, logs, or transmits passwords. No OAuth, Passkey, or Web3 providers are activated. | `app/auth-actions.ts`, `lib/validation/auth.ts`, `docs/SECURITY.md` §1 | `[VERIFIED]` |
| **2. Cookie / Session Behavior** | **SSR HttpOnly Cookies.** `@supabase/ssr` sets and refreshes HttpOnly, Secure (production), `SameSite=Lax` cookies. Access tokens are short-lived JWTs. No tokens are stored in `localStorage` or `sessionStorage`. | `middleware.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts` | `[VERIFIED]` |
| **3. Session Lifetime** | Standard JWT access token lifespan (`3600s` / 1 hour). Session cookies are refreshed on every non-static request via Next.js middleware. | `middleware.ts:L41-66`, `supabase/config.toml:L163-164` | `[VERIFIED]` |
| **4. Refresh Token Handling** | Refresh token rotation enabled (`enable_refresh_token_rotation = true`) with a 10-second reuse interval. Rotated tokens are automatically re-set in response cookies during request middleware execution. | `middleware.ts`, `supabase/config.toml:L170-173` | `[VERIFIED]` |
| **5. Login Flow** | Server action `loginAction` accepts validated credentials (`loginSchema`), calls `supabase.auth.signInWithPassword()`, and resolves tenant context via `getCurrentUser()`. On success, redirects to role home (`roleHome(ctx.roles)`). On failure/disabled account, terminates session and redirects to `/login?error=...`. | `app/auth-actions.ts:L13-39`, `app/login/page.tsx` | `[VERIFIED]` |
| **6. Logout Flow** | Server action `logoutAction` and API route `POST /api/v1/auth/logout` invoke `supabase.auth.signOut()`, purging all session cookies and redirecting to `/login`. | `app/auth-actions.ts:L41-45`, `app/api/v1/auth/logout/route.ts` | `[VERIFIED]` |
| **7. Password Reset / Recovery** | **Supabase Email Recovery Only.** No custom in-app password reset UI or public registration in V1. Password reset relies on Supabase Auth recovery links delivered via email. Requires production SMTP. | `docs/SECURITY.md` §1, `docs/PRODUCTION_DEPLOYMENT.md` §4 | `[DOCUMENTED ONLY]` |
| **8. Email Confirmation** | Provisioning operations (`createUserWithRole` in `lib/services/users.ts` and `createSchoolWithAdmin` in `lib/services/onboarding.ts`) explicitly pass `email_confirm: true` to the Supabase Admin API because accounts are pre-verified by school administrators. | `lib/services/users.ts:L146`, `lib/services/onboarding.ts:L58` | `[VERIFIED]` |
| **9. Redirect URLs** | Core application routes requiring redirection: `/login`, `/admin`, `/teacher`, `/parent`, `/student`, `/no-access`. Protected route access without a session redirects to `/login?next=<pathname>`. | `middleware.ts:L78-83`, `lib/auth/session.ts:L209-214` | `[VERIFIED]` |
| **10. Production APP_URL** | Canonical base URL injected via `NEXT_PUBLIC_APP_URL` (used for constructing links and absolute redirects). | `lib/config/env.ts`, `docs/PRODUCTION_DEPLOYMENT.md` §2 | `[VERIFIED]` |
| **11. Auth Rate Limiting** | Strict sliding-window per-IP rate limiting enforced in `middleware.ts`: **10 requests / 10 minutes** per IP on `/api/v1/auth/*` and `/api/v1/onboarding/*`. | `middleware.ts:L22-31`, `lib/security/rate-limit.ts` | `[VERIFIED]` |
| **12. Inactive-User Handling** | **Triple-layer Fail-Closed:** (1) `resolveSessionContext()` throws `InactiveUserError` if `profile.is_active` or `school.is_active` is false; (2) `setUserActive()` synchronizes deactivation with Supabase Auth identity ban (`ban_duration: '876000h'`); (3) RLS helper `current_school_id()` checks `u.is_active`. | `lib/auth/session.ts:L141-146`, `lib/services/users.ts:L251`, `supabase/migrations/0002_auth_tenant.sql` | `[VERIFIED]` |
| **13. Role Resolution** | `getCurrentUser()` maps `auth.uid()` -> `public.users` -> `public.user_roles` -> `public.schools`. Resolved context contains strictly typed `SessionContext` (`authUserId`, `profile`, `school`, `roles`). | `lib/auth/session.ts:L289-306` | `[VERIFIED]` |
| **14. No-Access Behavior** | Authenticated Supabase identities without a provisioned or active `public.users` profile throw `MissingProfileError`, routing the user to `/no-access` with an option to sign out. | `lib/auth/session.ts:L138-140`, `app/no-access/page.tsx` | `[VERIFIED]` |

---

## 3. PRODUCTION SUPABASE AUTH CONFIGURATION `[AUDITED]`

Inspected live settings on linked production Supabase project `rpcydhgavfebywhlfukp` (`simplin school production`):

| Setting | Current Production Value | Target Production Expectation | Status / Gap |
| :--- | :--- | :--- | :--- |
| **Site URL** | `http://localhost:3000` | `https://<production-domain>.com` | `[NOT CONFIGURED]` — Unconfigured default placeholder |
| **Redirect Allowlist (`additional_redirect_urls`)** | `[]` (Empty) | `https://<production-domain>.com/**` | `[NOT CONFIGURED]` — Needs production URL pattern |
| **Email Confirmations (`enable_confirmations`)** | `true` | `true` (Admin provisioning passes `email_confirm: true`) | `[CONFIGURED]` |
| **Password Min Length** | `6` characters | `8` characters minimum recommended | `[CONFIGURED]` |
| **Password Complexity Requirements** | None | Letters + Digits recommended | `[CONFIGURED]` |
| **JWT Expiry (`jwt_expiry`)** | `3600` seconds (1 hour) | `3600` seconds (1 hour) | `[CONFIGURED]` |
| **Refresh Token Rotation** | Enabled (`reuse_interval: 10s`) | Enabled (`reuse_interval: 10s`) | `[CONFIGURED]` |
| **Anonymous Sign-ins** | Disabled | Disabled | `[CONFIGURED]` |
| **MFA (TOTP)** | Enabled in Cloud | Not used by V1 UI (deferred by design) | `[CONFIGURED]` |
| **Custom SMTP Provider** | Not configured (Using Supabase default mailer) | Dedicated transactional SMTP (SendGrid / SES / Postmark) | `[BLOCKED]` — Required for reliable password reset delivery |

---

## 4. AUTH CONFIGURATION DECISION & ACTION PLAN

### 1. Required Production Site URL
- **Required Setting:** Set `Site URL` to the canonical production URL: `https://<production-domain>.com`.

### 2. Required Redirect URLs
- **Required Setting:** Add to `Redirect URLs` allowlist:
  - `https://<production-domain>.com/**`
  - `https://<production-domain>.com/login`
  - `https://<production-domain>.com/admin`
  - `https://<production-domain>.com/teacher`
  - `https://<production-domain>.com/parent`
  - `https://<production-domain>.com/student`

### 3. Required Email-Confirmation Behavior
- Keep `Enable email confirmations` set to `true`.
- Automated server-side account provisioning (`lib/services/users.ts` and `lib/services/onboarding.ts`) explicitly sets `email_confirm: true` via the service-role client, allowing administrative user creation without onboarding deadlocks.

### 4. Required Password & Security Settings
- **Minimum Password Length:** Set to at least **8 characters**.
- **Password Requirements:** Enable standard character requirements (letters and numbers).
- **Brute-Force & Rate Limiting:** Enforce Supabase Auth rate limits alongside application-layer rate limiting in `middleware.ts` (10 requests/10 min).

### 5. Required Session Settings
- **JWT Expiry:** `3600` seconds (1 hour).
- **Refresh Token Rotation:** Enabled.
- **Refresh Token Reuse Interval:** `10` seconds.

### 6. SMTP Dependency & Operational Impact
- **Current Limitation:** The default Supabase internal mail service is strictly throttled (rate limited to ~3 emails/hour).
- **Operational Requirement:** To enable self-service password recovery and invitation delivery, configure custom transactional SMTP (Amazon SES, SendGrid, Postmark, or Resend) in **Supabase Dashboard -> Authentication -> Email Settings**.

### 7. Summary of Current Production Configuration Gaps
1. `Site URL` is currently set to `http://localhost:3000`.
2. `Redirect URLs` allowlist is currently empty.
3. Custom SMTP credentials are not yet configured.

### 8. Exact Manual Changes Required (In Supabase Dashboard)
1. Navigate to **Authentication -> URL Configuration**:
   - Update **Site URL** to `https://<production-domain>.com`.
   - In **Redirect URLs**, add `https://<production-domain>.com/**`.
2. Navigate to **Authentication -> Email Settings**:
   - Toggle **Enable Custom SMTP**.
   - Input SMTP Host, Port (587/465), Username, and API Key / Password.
   - Set **Sender Email** to `noreply@<production-domain>.com`.
   - Set **Sender Name** to `SIMPLEIN SCHOOL ERP`.
3. Navigate to **Authentication -> Security**:
   - Verify Minimum Password Length is at least `8`.

### 9. Post-Configuration Verification Test Plan
1. **Smoke Test Health:** `GET /api/v1/health` returns `200 OK`.
2. **Onboarding Smoke Test:** Run onboarding script to provision pilot school and initial `SCHOOL_ADMIN`.
3. **Admin Login Test:** Authenticate with admin credentials -> verify redirect to `/admin`.
4. **Session Refresh Test:** Verify cookies refresh automatically upon navigating between dashboard pages.
5. **Deactivated Account Test:** Disable user via admin API -> verify immediate fail-closed rejection on subsequent requests.
6. **Password Recovery Test:** Request password reset -> verify email delivery from custom SMTP and link redirection to production site.
7. **Logout Test:** Click Logout -> verify all cookies cleared and user returned to `/login`.
