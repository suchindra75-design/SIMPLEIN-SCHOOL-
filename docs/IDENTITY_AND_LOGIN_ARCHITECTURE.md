# SIMPLEIN SCHOOL ERP — Identity Resolution & Multi-Role Login Architecture

**Document Classification:** Architecture & Security Specification  
**Project:** SIMPLEIN SCHOOL ERP  
**Organization:** SIMPLEIN SOLUTIONS LLP  
**Target Environment:** Staging / Demo / Production  
**Document Version:** 1.0.0  
**Status:** Implemented & Verified  

---

## 1. Executive Summary

Historically, the ERP required every user (Students, Parents, Teachers, Administrators) to authenticate using an email address. However, in real-world educational institutions:
- **Students** rarely possess or remember school email addresses; they identify themselves via their **Admission Number** (e.g., `S-2026-001`).
- **Parents** communicate and authenticate using their primary **Mobile Phone Number** (e.g., `9876543210` or `+91 98765 43210`).
- **Teachers** use their institutional **Employee ID / Code** (e.g., `T-1001`).
- **School Administrators** continue to use their administrative **Email Address**.

This specification outlines the **Server-Side Identity Resolution Architecture** implemented in `lib/services/identity.ts`, `lib/validation/auth.ts`, `app/auth-actions.ts`, and `app/login/form.tsx`.

---

## 2. Core Architectural Principles

1. **Zero Auth Engine Rewrite:** All authentication continues to leverage Supabase Auth (`@supabase/ssr` / GoTrue) with standard cryptographically secure password hashing, session tokens, JWTs, and HttpOnly cookies.
2. **Deterministic Server-Side Resolution:** School-facing identifiers are securely translated to internal user emails on the server runtime prior to authentication calls. The client never handles raw user lookup credentials.
3. **Multi-Tenant Isolation:** Resolution queries operate strictly within tenant-aware database constraints or through secure system-level lookup functions that verify school tenant context.
4. **Resilient Normalization:** All inputs undergo strict whitespace trimming, case normalization (e.g., uppercase for admission/employee codes), and phone number character sanitization (digits only).
5. **Universal Fallback:** Direct email entry is preserved across all role tabs to ensure backwards compatibility and administrative overrides.

---

## 3. Identifier Mapping Matrix

```
┌──────────────┬────────────────────────┬─────────────────────────────┬────────────────────────────────────────────────────────┐
│ Role Tab     │ User Identifier Field  │ Database Entity Resolution  │ Normalized Translation Target                          │
├──────────────┼────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────────────┤
│ STUDENT      │ Admission Number       │ `students.admission_no`     │ `students.user_id` -> `users.email`                    │
│              │ (e.g. "S-2026-001")    │ (or `users.email` direct)   │                                                        │
├──────────────┼────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────────────┤
│ PARENT       │ Phone / Mobile Number  │ `parents.phone` OR          │ `parents.user_id` -> `users.email`                     │
│              │ (e.g. "9876543210")    │ `users.phone`               │                                                        │
├──────────────┼────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────────────┤
│ TEACHER      │ Employee / Staff ID    │ `teachers.employee_no`      │ `teachers.user_id` -> `users.email`                    │
│              │ (e.g. "T-1001")        │ (or `users.email` direct)   │                                                        │
├──────────────┼────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────────────┤
│ SCHOOL_ADMIN │ Email Address          │ `users.email` (Direct)      │ Direct Auth Submission                                 │
└──────────────┴────────────────────────┴─────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 4. Sequence Flow

```
[User Browser]                      [Next.js Server Action]                    [Supabase DB / Auth]
      │                                       │                                         │
      │ 1. Submits { role, identifier, pwd }  │                                         │
      ├──────────────────────────────────────>│                                         │
      │                                       │ 2. Validates input schema               │
      │                                       │    (roleLoginSchema)                    │
      │                                       │                                         │
      │                                       │ 3. resolveIdentifierToEmail(...)        │
      │                                       ├────────────────────────────────────────>│
      │                                       │    - Checks role specific table         │
      │                                       │    - Resolves user_id -> email          │
      │                                       │    - Verifies account status = ACTIVE   │
      │                                       │<────────────────────────────────────────┤
      │                                       │                                         │
      │                                       │ 4. signInWithPassword({ email, pwd })   │
      │                                       ├────────────────────────────────────────>│
      │                                       │<────────────────────────────────────────┤
      │                                       │                                         │
      │                                       │ 5. Sets SSR Session Cookies             │
      │ 6. Redirects to role home             │    (HttpOnly, Secure, SameSite=Lax)     │
      │<──────────────────────────────────────┤                                         │
```

---

## 5. Security & Privacy Guarantees

1. **Non-Leaking Error Responses:** If an identifier does not exist or the account is inactive, the system returns a generic `Invalid credentials.` error. It never reveals whether an identifier exists in the database.
2. **Inactive Account Fail-Closed:** If a user's record in `users` has `status = 'INACTIVE'`, the identity resolver ignores the match, preventing disabled accounts from authenticating.
3. **Rate Limiting Protection:** All login attempts are guarded by IP and account-level sliding-window rate limiters.
4. **RBAC Role Guard Verification:** Following successful authentication, the server-side role router verifies that the user possesses the appropriate role in `user_roles` matching their intended portal.

---

## 6. Consolidated Student + Parent Provisioning

In addition to login resolution, the Admin student creation interface (`app/admin/students/new/page.tsx` & `createStudentAction` in `app/admin/actions.ts`) has been consolidated:
- Administrators can enter student details (Admission No, Full Name, Class, Section, Gender, DOB).
- In the **same form**, administrators can enter parent details (Parent Name, Relationship, Phone Number, Optional Email).
- The server action transactionally:
  1. Creates the Student user and profile.
  2. Resolves or creates the Parent user and profile with normalized phone lookup.
  3. Establishes the `student_parents` linking relation with `is_primary = true`.
