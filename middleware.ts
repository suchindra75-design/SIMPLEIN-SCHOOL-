import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { clientIp, RateLimiter, tierFor } from "@/lib/security/rate-limit";

const PROTECTED_PREFIXES = ["/admin", "/teacher", "/parent", "/student"];

// Per-process limiter (see lib/security/rate-limit.ts for the swap-in story).
const globalForLimiter = globalThis as unknown as { rateLimiter?: RateLimiter };
const limiter = (globalForLimiter.rateLimiter ??= new RateLimiter());

/**
 * Rate limiting + session refresh + first-line route protection.
 * - Rate-limits /api/v1/* per tier (AUTH/WRITE/READ) → 429 + Retry-After.
 * - Refreshes the Supabase session cookies on every request.
 * - Redirects anonymous users away from protected dashboards to /login.
 * - Tolerant of missing env (CI without Supabase): passes through untouched.
 * - NOT the final authorization word: role layouts re-verify server-side
 *   (requireRole) and every API route enforces auth + RBAC + tenant scope.
 */
export async function middleware(request: NextRequest) {
  // 1. Rate limiting (works without Supabase env too).
  const tier = tierFor(request.nextUrl.pathname, request.method);
  if (tier !== null) {
    const result = limiter.check(tier, clientIp(request.headers));
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429, headers: { "retry-after": String(result.retryAfterSeconds) } },
      );
    }
  }

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (url === undefined || anonKey === undefined) {
    return NextResponse.next({ request });
  }

  // 2. Session refresh.
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ): void {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(
            name,
            value,
            options as { path?: string; maxAge?: number },
          );
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 3. First-line route protection (role layouts re-verify server-side).
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && user === null) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
