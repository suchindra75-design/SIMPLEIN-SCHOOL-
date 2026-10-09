# SIMPLEIN SCHOOL ERP — Demo Environment Specification (V1)

**Document Classification:** Internal Technical Documentation  
**Project:** SIMPLEIN SCHOOL ERP  
**Organization:** SIMPLEIN SOLUTIONS LLP  
**Repository Branch:** `phase-16-production-infrastructure`  
**Target Environment:** Staging / Demo Tier  
**Target Supabase Project:** `simplein school` (Ref: `krzbajfioftoubcbyeso`, Region: `ap-northeast-2`)  
**Deployment Platform:** Vercel (Preview / Demo Environment)  
**Security Boundary:** Strictly ISOLATED from Production Supabase (`rpcydhgavfebywhlfukp`)  

---

## 1. ARCHITECTURAL OVERVIEW

The Demo Environment provides a fully functional, safe sandbox for end-to-end demonstration of the SIMPLEIN SCHOOL ERP across all four core personas (`SCHOOL_ADMIN`, `TEACHER`, `PARENT`, `STUDENT`).

### Infrastructure Topology:

```
┌────────────────────────────────────────────────────────┐
│               Vercel Demo Deployment                   │
│           (Canonical Preview / Demo URL)               │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / SSR Cookies
                           ▼
┌────────────────────────────────────────────────────────┐
│            Next.js 15 App Router Application           │
│     (Dynamic Route Handlers & Server Components)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Supabase Client / SSR (@supabase/ssr)
                           ▼
┌────────────────────────────────────────────────────────┐
│                STAGING Supabase Project                │
│       Project Name: "simplein school" (ap-northeast-2) │
│       Database: PostgreSQL 17 (Migrations 0001–0015)   │
│       Storage: 7 Private Buckets                       │
│       Auth: GoTrue Auth Engine                         │
└────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Production Boundary Guarantee:** The demo environment connects **exclusively** to the Staging Supabase project (`krzbajfioftoubcbyeso`). It has zero access, zero credentials, and zero network routing to the Production Supabase project (`rpcydhgavfebywhlfukp`).

---

## 2. ENVIRONMENT VARIABLES SPECIFICATION

The demo deployment requires the following environment variable names configured in the Vercel Demo Project settings:

| Variable Name | Scope | Client Visibility | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Exposed to Browser | Staging Supabase Project URL (`https://krzbajfioftoubcbyeso.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Exposed to Browser | Staging Supabase Anonymous / Publishable Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | **NEVER** in Browser | Staging Supabase Service-Role Key (used only for trusted onboarding/provisioning) |
| `ONBOARDING_SECRET` | Server-Only | **NEVER** in Browser | Shared bearer secret for `POST /api/v1/onboarding/school` |
| `NEXT_PUBLIC_APP_URL` | Public | Exposed to Browser | Canonical Demo URL (e.g., `https://simplein-school-demo.vercel.app`) |

*Security Constraint:* No secret values are stored in source code, repository files, or Git history. Secrets are populated directly into Vercel environment settings or local `.env.local`.

---

## 3. DEMO ROLES & AUTHENTICATION SPECIFICATION

The demo environment provisions four distinct user personas to showcase the full multi-tenant RBAC system:

```
┌─────────────────┬──────────────────────┬─────────────────────────────────────────────────────────┐
│ Role            │ Demo User Persona    │ Primary Demonstration Scope                             │
├─────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ SCHOOL_ADMIN    │ Principal / Admin    │ Full institutional management, academic structure,      │
│                 │                      │ fee structures, student import, timetable, promotions   │
├─────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ TEACHER         │ Class & Subject Lead │ Assigned class attendance, exam marks entry & locking,  │
│                 │                      │ homework assignment, subject-specific timetable         │
├─────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ PARENT          │ Guardian of Student  │ Multi-child selector, attendance view, published marks, │
│                 │                      │ report cards, homework tracking, fee receipts           │
├─────────────────┼──────────────────────┼─────────────────────────────────────────────────────────┤
│ STUDENT         │ High School Student  │ Self-only portal: timetable, homework, published marks, │
│                 │                      │ report card downloads, past exam question bank (PYQ)    │
└─────────────────┴──────────────────────┴─────────────────────────────────────────────────────────┘
```

### Authentication Mechanics:
1. **Multi-Role Identifier Login:** Users can authenticate via role-specific tabs on `app/login`:
   - `STUDENT`: Login with **Admission Number** (e.g. `S-2026-001`) or email + password.
   - `PARENT`: Login with **Mobile Phone Number** (e.g. `9876543210`) or email + password.
   - `TEACHER`: Login with **Employee / Staff ID** (e.g. `T-1001`) or email + password.
   - `SCHOOL_ADMIN`: Login with **Email Address** + password.
2. **Server-Side Identity Resolution:** The server securely resolves non-email identifiers (`admission_no`, `phone`, `employee_no`) to the corresponding internal user account email via `lib/services/identity.ts` before executing Supabase authentication.
3. **Session Persistence:** Secure, HttpOnly, SameSite=Lax session cookies refreshed on every request by `middleware.ts`.
4. **Role Routing:** Post-login redirection automatically routes each user to their role-specific home (`roleHome()`):
   - `SCHOOL_ADMIN` -> `/admin`
   - `TEACHER` -> `/teacher`
   - `PARENT` -> `/parent`
   - `STUDENT` -> `/student`
5. **Fail-Closed Security:** Inactive accounts or unprovisioned profiles fail closed and are routed to `/login?error=disabled` or `/no-access`.

---

## 4. DEMO DATA ARCHITECTURE

All demo data is realistic yet **strictly fictional**. No real student, parent, teacher, or institutional data is used.

### Fictional Institutional Blueprint: "Greenfield Public School"
- **Tenant:** Greenfield Public School (Slug: `greenfield-public-school`, Timezone: `Asia/Kolkata`)
- **Academic Year:** `2026-2027` (Status: `ACTIVE`)
- **Grading System:** CBSE Standard 10-Point Scale (Grades: A1, A2, B1, B2, C1, C2, D, E1, E2)
- **Class & Section Hierarchy:**
  - Grade 9: Section A (`9-A`), Section B (`9-B`)
  - Grade 10: Section A (`10-A`), Section B (`10-B`)
- **Subjects:**
  - Mathematics (Core), Science (Core), English Language & Literature (Core), Social Science (Core), Hindi (Elective)
- **People & Assignments:**
  - 4 Teachers with specific class teacher and subject teacher allocations.
  - 20 Students distributed across Sections 9-A, 9-B, 10-A, 10-B.
  - 15 Parents with verified `student_parents` linkages (including multi-sibling households).
- **Academic Operations:**
  - Attendance Sessions: Historical and current attendance records.
  - Exams: Mid-Term Examination 2026, Unit Test 1 (with schedules and subject max/pass marks).
  - Marks & Results: Saved and locked marksheets; published exam results.
  - Report Cards: Generated report card snapshots.
  - Timetable: Weekly schedule slots (Monday–Friday, Periods 1–7) with subject teacher assignments.
- **Communications & Logistics:**
  - Homework: Homework assignments with PDF attachment examples.
  - Notices: School-wide announcements and section-targeted circulars.
  - Notifications: Recipient-filtered notification inbox items.
- **Financial & Portal Records:**
  - Fee Structures: Tuition Fee, Laboratory Fee, Sports Fee (assigned to student cohorts).
  - Payment Records: Verified fee payments and generated receipt snapshots.
  - Past Year Question Papers (PYQs): Sample CBSE question papers with file attachments.
  - Storage Objects: Sample student/teacher avatar photos, homework PDFs, and notice attachments.

---

## 5. STORAGE DEMO CONFIGURATION

The demo environment operates with all **7 private Supabase Storage buckets**:
1. `student-photos` (Private)
2. `teacher-photos` (Private)
3. `report-cards` (Private)
4. `homework-attachments` (Private)
5. `notice-attachments` (Private)
6. `fee-receipts` (Private)
7. `pyqs` (Private)

### Storage Security Verification:
- **Bucket Visibility:** All buckets maintain `public = false`.
- **Signed URL Access:** File retrieval is demonstrated exclusively via time-bound HMAC signed URLs (`expiresIn = 600` seconds / 10 minutes) generated by the service layer after business-logic authorization.
- **Direct Access Denial:** Direct unauthenticated or cross-tenant HTTP GET requests to raw object URLs are blocked by Storage RLS.

---

## 6. PROVISIONING & DEPLOYMENT PROCEDURE

### Step 1: Pre-Flight Verification
Run required local verification commands:
```bash
npm test
npm run typecheck
npm run lint
npm run build
```

### Step 2: Vercel Project Setup
1. Create a new project in Vercel or configure a Preview branch deployment for `phase-16-production-infrastructure`.
2. Configure environment variables in Vercel Project Settings using Staging Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ONBOARDING_SECRET`
   - `NEXT_PUBLIC_APP_URL`
3. Trigger deployment.

### Step 3: School Onboarding & Data Provisioning
1. Onboard the demo school via the onboarding endpoint:
   ```bash
   curl -X POST https://<demo-url>/api/v1/onboarding/school \
     -H "Authorization: Bearer <ONBOARDING_SECRET>" \
     -H "Content-Type: application/json" \
     -d '{
       "school": {
         "name": "Greenfield Public School",
         "slug": "greenfield-demo",
         "timezone": "Asia/Kolkata"
       },
       "admin": {
         "email": "admin@greenfield-demo.edu",
         "password": "<DEMO_PASSWORD>",
         "fullName": "Dr. Sunita Sharma"
       },
       "roles": ["SCHOOL_ADMIN"]
     }'
   ```
2. Log in as `SCHOOL_ADMIN` at `/login` to provision teachers, classes, sections, subjects, students, and parent links.

---

## 7. KNOWN LIMITATIONS & OPERATIONAL BOUNDARIES

1. **Email / Password Reset Limitation:** Staging Supabase does not have external custom SMTP configured. Self-service password reset emails are not supported in the demo; all demo users are provisioned with pre-set passwords via administrative endpoints with `email_confirm: true`.
2. **Rate Limiting Persistence:** The rate limiter utilizes an in-memory sliding window store. In a serverless deployment with multiple execution instances, rate limit counters operate on a per-instance basis.
3. **No Antivirus Scanning:** Uploaded demo files (PDFs/Images) are checked against strict MIME and extension allowlists, but binary antivirus scanning is not implemented.
4. **Not Production:** This environment is strictly for functional demonstrations, partner reviews, and UX evaluations. It must never be used for live institutional operations.
