import type { AppRole } from "@/lib/auth/rbac";

export type PortalType = "staff" | "family" | "unified";

export const STAFF_ROLES: readonly AppRole[] = ["SCHOOL_ADMIN", "TEACHER"];
export const FAMILY_ROLES: readonly AppRole[] = ["PARENT", "STUDENT"];

export const STAFF_ROUTE_PREFIXES = ["/admin", "/teacher"] as const;
export const FAMILY_ROUTE_PREFIXES = ["/parent", "/student"] as const;

/**
 * Determine portal identity based on host header and optional query param.
 * Supports:
 * - staff.simplinschool.com / staff.localhost / staff.127.0.0.1.nip.io -> "staff"
 * - family.simplinschool.com / family.localhost / family.127.0.0.1.nip.io -> "family"
 * - ?portal=staff / ?portal=family on any host -> that portal (single-domain
 *   deployments rely on this; roles are still enforced at sign-in and per route)
 * - default fallback (plain localhost or main domain) -> "unified"
 */
export function detectPortal(
  host: string | null | undefined,
  queryPortal?: string | null,
): PortalType {
  if (queryPortal === "staff" || queryPortal === "family") {
    return queryPortal;
  }

  if (!host) {
    return "unified";
  }

  // Strip port if present (e.g., "staff.localhost:3000" -> "staff.localhost")
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  if (
    hostname === "staff.simplinschool.com" ||
    hostname.startsWith("staff.")
  ) {
    return "staff";
  }

  if (
    hostname === "family.simplinschool.com" ||
    hostname.startsWith("family.")
  ) {
    return "family";
  }

  return "unified";
}

/** Check if user roles match the portal requirements. */
export function isRoleAllowedForPortal(
  portal: PortalType,
  roles: readonly AppRole[],
): boolean {
  if (portal === "unified") {
    return true;
  }
  if (portal === "staff") {
    return roles.some((r) => STAFF_ROLES.includes(r));
  }
  if (portal === "family") {
    return roles.some((r) => FAMILY_ROLES.includes(r));
  }
  return false;
}

/** Check which portal a protected path belongs to. */
export function getPortalForPath(pathname: string): "staff" | "family" | null {
  for (const prefix of STAFF_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return "staff";
    }
  }
  for (const prefix of FAMILY_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return "family";
    }
  }
  return null;
}

/**
 * Verify if a pathname is allowed on a specific portal.
 * Common public routes (login, api, root) are allowed everywhere.
 */
export function isPathAllowedForPortal(
  portal: PortalType,
  pathname: string,
): boolean {
  if (portal === "unified") {
    return true;
  }

  const pathPortal = getPortalForPath(pathname);
  if (pathPortal === null) {
    // Shared route (e.g. /login, /api/v1/..., /unauthorized)
    return true;
  }

  return portal === pathPortal;
}

/**
 * Get the portal home path for a user based on their roles and portal context.
 */
export function getPortalHome(
  portal: PortalType,
  roles: readonly AppRole[],
): string {
  if (portal === "staff") {
    if (roles.includes("SCHOOL_ADMIN")) return "/admin";
    if (roles.includes("TEACHER")) return "/teacher";
    return "/unauthorized";
  }

  if (portal === "family") {
    if (roles.includes("PARENT")) return "/parent";
    if (roles.includes("STUDENT")) return "/student";
    return "/unauthorized";
  }

  // Unified mode fallback
  if (roles.includes("SCHOOL_ADMIN")) return "/admin";
  if (roles.includes("TEACHER")) return "/teacher";
  if (roles.includes("PARENT")) return "/parent";
  return "/student";
}

/**
 * Resolves the base URL for the target portal.
 * Takes current host into consideration for local dev (e.g. *.localhost:3000)
 * vs production (staff.simplinschool.com / family.simplinschool.com).
 */
export function getPortalBaseUrl(
  targetPortal: "staff" | "family",
  currentHost?: string | null,
): string {
  // If explicitly configured via environment variables
  if (targetPortal === "staff" && process.env["NEXT_PUBLIC_STAFF_PORTAL_URL"]) {
    return process.env["NEXT_PUBLIC_STAFF_PORTAL_URL"].replace(/\/$/, "");
  }
  if (targetPortal === "family" && process.env["NEXT_PUBLIC_FAMILY_PORTAL_URL"]) {
    return process.env["NEXT_PUBLIC_FAMILY_PORTAL_URL"].replace(/\/$/, "");
  }

  if (currentHost) {
    const parts = currentHost.split(":");
    const hostname = parts[0]?.toLowerCase() ?? "";
    const port = parts[1] ? `:${parts[1]}` : "";

    // Local development with *.localhost
    if (hostname.endsWith("localhost") || hostname === "127.0.0.1") {
      const protocol = "http";
      return `${protocol}://${targetPortal}.localhost${port}`;
    }

    // Branded portal subdomains
    if (hostname === "simplinschool.com" || hostname.endsWith(".simplinschool.com")) {
      return `https://${targetPortal}.simplinschool.com`;
    }

    // Any other host is a single-domain deployment (e.g. *.vercel.app or a
    // school's own domain): both portals live on one origin and are chosen
    // with ?portal=. The Host header is client-controlled, so it is echoed
    // back only when this deployment is configured for that host; any other
    // host is sent to the canonical NEXT_PUBLIC_APP_URL instead.
    if (hostname !== "") {
      return configuredOrigins().get(`${hostname}${port}`) ?? canonicalAppOrigin();
    }
  }

  // No host information at all: stay relative to the current origin.
  return "";
}

/** Origin of NEXT_PUBLIC_APP_URL, or "" when it is unset or not a URL. */
export function canonicalAppOrigin(): string {
  const value = process.env["NEXT_PUBLIC_APP_URL"];
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

/**
 * Hosts this deployment is configured to serve, mapped to their origin: the
 * app URL, the optional portal URLs, and Vercel's own deployment, branch and
 * production hosts (system variables, always https).
 */
function configuredOrigins(): Map<string, string> {
  const origins = new Map<string, string>();
  for (const value of [
    process.env["NEXT_PUBLIC_APP_URL"],
    process.env["NEXT_PUBLIC_STAFF_PORTAL_URL"],
    process.env["NEXT_PUBLIC_FAMILY_PORTAL_URL"],
  ]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      origins.set(url.host.toLowerCase(), url.origin);
    } catch {
      // A malformed value configures nothing.
    }
  }
  for (const host of [
    process.env["VERCEL_URL"],
    process.env["VERCEL_BRANCH_URL"],
    process.env["VERCEL_PROJECT_PRODUCTION_URL"],
  ]) {
    if (host) origins.set(host.toLowerCase(), `https://${host.toLowerCase()}`);
  }
  return origins;
}

/** Local development hosts (localhost, 127.0.0.1, *.localhost, ::1, *.nip.io). */
export function isLocalDevHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : (host.split(":")[0] ?? "");
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1" || h.endsWith(".nip.io");
}

/**
 * Redirect target for a request that belongs to the other portal. On a
 * single-domain deployment the target is this same host, so the `portal`
 * query parameter that caused the switch is dropped (otherwise the request
 * would be redirected back and forth forever). `requestOrigin` (the
 * framework's view of this request's origin) is used only when no portal or
 * app URL applies, i.e. when nothing is configured.
 */
export function crossPortalRedirectUrl(
  targetBase: string,
  pathname: string,
  search: string,
  currentHost: string,
  requestOrigin: string,
): URL {
  const url = new URL(`${pathname}${search}`, targetBase || requestOrigin);
  if (url.host === currentHost) url.searchParams.delete("portal");
  return url;
}

/**
 * Validate redirect URLs to strictly prevent open redirects.
 * Only relative paths starting with single '/' and no protocol/host injection allowed.
 */
export function validateSafeRedirect(
  redirectPath: string | null | undefined,
  fallback = "/",
): string {
  if (!redirectPath || typeof redirectPath !== "string") {
    return fallback;
  }

  const trimmed = redirectPath.trim();

  // Reject paths that start with protocol, double slash, backslash, or whitespace
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("://") ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return fallback;
  }

  // Must not have javascript: or data: pseudo-protocols
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("/javascript:") || lower.startsWith("/data:")) {
    return fallback;
  }

  return trimmed;
}
