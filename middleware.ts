import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { clientIp, RateLimiter, tierFor } from "@/lib/security/rate-limit";
import {
  crossPortalRedirectUrl,
  detectPortal,
  getPortalBaseUrl,
  getPortalForPath,
} from "@/lib/auth/portal";

const PROTECTED_PREFIXES = [
  "/admin",
  "/teacher",
  "/parent",
  "/student",
  "/notifications",
];

// Per-process limiter (see lib/security/rate-limit.ts for the swap-in story).
const globalForLimiter = globalThis as unknown as { rateLimiter?: RateLimiter };
const limiter = (globalForLimiter.rateLimiter ??= new RateLimiter());

/**
 * Rate limiting + session refresh + host-based portal routing + first-line route protection.
 * - Rate-limits /api/v1/* per tier (AUTH/WRITE/READ) → 429 + Retry-After.
 * - Refreshes the Supabase session cookies on every request.
 * - Isolates Staff and Family portals via host-based routing.
 * - Redirects users attempting cross-portal navigation to the appropriate portal base URL.
 * - Redirects anonymous users away from protected dashboards to /login.
 * - NOT the final authorization word: role layouts re-verify server-side
 *   (requireDashboard / requireRole) and every API route enforces auth + RBAC + tenant scope.
 */
export async function middleware(request: NextRequest) {
  // 1. Rate limiting (works without Supabase env too).
  const tier = tierFor(request.nextUrl.pathname, request.method);
  if (tier !== null) {
    // Bucket per tier + IP, so API traffic cannot exhaust the login allowance.
    const result = limiter.check(tier, `${tier}:${clientIp(request.headers)}`);
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429, headers: { "retry-after": String(result.retryAfterSeconds) } },
      );
    }
  }

  // 2. Host-based portal detection
  const startMs = performance.now();
  const host = request.headers.get("host") || request.nextUrl.host;
  const portalQuery = request.nextUrl.searchParams.get("portal");
  const portal = detectPortal(host, portalQuery);
  const { pathname, search } = request.nextUrl;

  // 3. Cross-portal route boundary enforcement
  const routePortal = getPortalForPath(pathname);
  if (portal === "staff" && routePortal === "family") {
    // Cross-portal navigation from staff to family
    const familyBase = getPortalBaseUrl("family", host);
    return NextResponse.redirect(crossPortalRedirectUrl(familyBase, pathname, search, host, request.nextUrl.origin));
  }
  if (portal === "family" && routePortal === "staff") {
    // Cross-portal navigation from family to staff
    const staffBase = getPortalBaseUrl("staff", host);
    return NextResponse.redirect(crossPortalRedirectUrl(staffBase, pathname, search, host, request.nextUrl.origin));
  }

  // If visiting the root on a branded portal subdomain:
  // (Staff subdomain root -> /login or dashboard, Family subdomain root -> /login or dashboard)
  if (pathname === "/" && (portal === "staff" || portal === "family")) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = "/login";
    return NextResponse.redirect(targetUrl);
  }

  // Set request headers so downstream Server Components can read portal context
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-auth-user-id");
  requestHeaders.set("x-portal", portal);
  requestHeaders.set("x-portal-host", host);

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (url === undefined || anonKey === undefined) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 4. Session refresh
  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

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
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
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

  if (user !== null) {
    requestHeaders.set("x-auth-user-id", user.id);
    const prevCookies = supabaseResponse.cookies.getAll();
    supabaseResponse = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    for (const c of prevCookies) {
      supabaseResponse.cookies.set(c);
    }
  }

  // 5. First-line route protection (role layouts re-verify server-side)
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && user === null) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const durationMs = Math.round(performance.now() - startMs);
  supabaseResponse.headers.set("Server-Timing", `mw;dur=${durationMs}`);
  if (process.env.NODE_ENV === "development") {
    console.log(`[MW] ${request.method} ${pathname} (${durationMs}ms)`);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
