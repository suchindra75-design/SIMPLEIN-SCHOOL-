# SIMPLEIN SCHOOL — Demo Performance Report

**Date:** 2026-10-04
**Environment:** Staging only (Production untouched)
**Staging Supabase:** `krzbajfioftoubcbyeso` (ap-northeast-2 / Seoul)
**Vercel Region:** `iad1` (Washington, D.C.)

---

## 1. Root Cause Analysis

### Primary Latency Driver: Cross-Region Topology

| Component | Region | Location |
|-----------|--------|----------|
| Vercel Serverless Functions | `iad1` | Washington, D.C., USA |
| Supabase Staging | `ap-northeast-2` | Seoul, South Korea |

**Estimated RTT per Supabase call:** ~150–250ms (US East ↔ Korea)

Every Supabase query from a server component or middleware pays this cross-region penalty. The original architecture performed **multiple sequential Supabase calls** per page load, compounding the latency linearly.

### Secondary Driver: Sequential Query Waterfalls

The original session resolution pattern was:

```
auth.getUser()          →  ~200ms  (RTT 1)
  ↓ wait
users.select(...)       →  ~200ms  (RTT 2)
  ↓ wait
user_roles.select(...)  →  ~200ms  (RTT 3)
  ↓ wait
schools.select(...)     →  ~200ms  (RTT 4)
```

**Total session overhead: ~800ms before any page data is fetched.**

Many dashboard pages then performed 2–4 additional sequential queries, adding another 400–800ms.

**Worst case (e.g. Admin Class Detail):** 4 auth + 4 data = **~1600ms** in sequential Supabase calls alone.

---

## 2. Optimizations Implemented

### A. Session Query Consolidation

**File:** `lib/auth/session.ts`

**Before:** 4 sequential Supabase calls (auth → profile → roles → school)

**After:** 2 calls total:
1. `auth.getUser()` (cannot be avoided)
2. Single `users.select(...)` with embedded joins:
   ```sql
   users.select("..., schools(...), user_roles!user_roles_user_id_fkey(role)")
   ```

**Impact:** Eliminates 2 cross-region round trips per request (~400ms saved).

The explicit foreign key hint (`user_roles!user_roles_user_id_fkey`) was required because Supabase's PostgREST detected ambiguous FK relationships without it.

### B. Request-Level Memoization

**File:** `lib/auth/session.ts`

Wrapped `getCurrentUser()` with `React.cache()` so that multiple calls to `requireRole()`, `requireAuth()`, `getCurrentProfile()`, etc. within the same server request share a single resolved session — no duplicate Supabase calls.

### C. Query Parallelization (10 Pages)

Converted sequential `await` chains to `Promise.all()` across all pages with independent data fetches:

| Page | Sequential Calls → Parallel | Estimated Savings |
|------|----------------------------|-------------------|
| `app/student/page.tsx` | 7 calls → 1 `Promise.all` | ~6 RTTs (~1200ms) |
| `app/admin/students/page.tsx` | 2 → parallel | ~1 RTT (~200ms) |
| `app/admin/classes/[id]/page.tsx` | 4 → parallel | ~3 RTTs (~600ms) |
| `app/admin/teachers/[id]/page.tsx` | 3 → parallel | ~2 RTTs (~400ms) |
| `app/admin/notices/page.tsx` | 2 → parallel | ~1 RTT (~200ms) |
| `app/admin/fees/page.tsx` | 4 → parallel | ~3 RTTs (~600ms) |
| `app/admin/parents/[id]/page.tsx` | 2 → parallel | ~1 RTT (~200ms) |
| `app/student/attendance/page.tsx` | 2 → parallel | ~1 RTT (~200ms) |
| `app/teacher/homework/page.tsx` | 2 → parallel | ~1 RTT (~200ms) |
| `app/admin/page.tsx` | Already parallel | — |

---

## 3. Estimated Impact

### Per-Page Latency Model (Cross-Region)

| Scenario | Auth RTTs | Data RTTs | Total Sequential RTTs | Est. Duration |
|----------|-----------|-----------|-----------------------|---------------|
| **Before** (worst: class detail) | 4 | 4 | 8 | ~1600ms |
| **After** (class detail) | 2 | 1 | 3 | ~600ms |
| **Before** (student dashboard) | 4 | 7 | 11 | ~2200ms |
| **After** (student dashboard) | 2 | 1 | 3 | ~600ms |
| **Before** (admin fees) | 4 | 4 | 8 | ~1600ms |
| **After** (admin fees) | 2 | 1 | 3 | ~600ms |

These estimates assume ~200ms per cross-region Supabase call. Actual improvement depends on network conditions and query complexity. The middleware `auth.getUser()` call adds ~200ms to every request regardless of optimization.

### Theoretical Improvement Range

- **Session resolution:** 4 RTTs → 2 RTTs = **~50% reduction** in auth overhead
- **Data-heavy pages:** 60–73% reduction in total sequential RTTs
- **Simple pages (1 data query):** ~40% improvement (auth savings only)

---

## 4. Validation

All checks pass after optimization:

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | PASS |
| ESLint (`eslint .`) | PASS |
| Tests (`vitest`) | 302/302 passed |
| Production Build (`next build`) | PASS |

### Security Assertions (Unchanged)

- RLS policies untouched
- RBAC enforcement untouched
- Tenant isolation untouched
- No cross-tenant caching
- Session resolution still fails-closed
- Middleware still calls `auth.getUser()` (no shortcut)

---

## 5. What Was NOT Changed

| Item | Reason |
|------|--------|
| Middleware `auth.getUser()` | Required for session refresh; cannot skip |
| Supabase region | Infrastructure change, out of scope |
| Vercel function region | Requires Vercel project settings change |
| Database indexes | No evidence of slow queries (latency is network, not query) |
| Client-side caching | Would require SWR/React Query integration (larger change) |
| Visual/UI changes | Explicitly out of scope |

---

## 6. Deployment Recommendations

### Immediate (Low Risk)
These optimizations are ready to deploy as-is.

### Future Considerations

1. **Co-locate Vercel and Supabase regions.** Moving either Vercel functions to `ap-northeast-2` or Supabase to `us-east-1` would eliminate the ~150–250ms cross-region RTT entirely. This alone would likely halve all page load times.

2. **Vercel Edge Functions for middleware.** Moving the middleware to Edge Runtime would distribute session refresh closer to users, but the Supabase call would still incur the cross-region penalty.

3. **Client-side data caching (SWR/React Query).** For repeat navigations, client-side caching could serve stale data immediately while revalidating in the background. This is a larger architectural change.

4. **Supabase connection pooling (Supavisor).** Already enabled by default on newer Supabase projects. Reduces connection setup overhead.

---

## 7. Files Modified

```
# Session optimization (auth query consolidation + memoization)
lib/auth/session.ts

# Query parallelization
app/student/page.tsx
app/student/attendance/page.tsx
app/admin/students/page.tsx
app/admin/classes/[id]/page.tsx
app/admin/teachers/[id]/page.tsx
app/admin/notices/page.tsx
app/admin/fees/page.tsx
app/admin/parents/[id]/page.tsx
app/teacher/homework/page.tsx
```

**Production Supabase (`rpcydhgavfebywhlfukp`) was NOT modified in any way.**
