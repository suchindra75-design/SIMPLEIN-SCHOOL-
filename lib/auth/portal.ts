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
 * - localhost / 127.0.0.1 with ?portal=staff -> "staff"
 * - localhost / 127.0.0.1 with ?portal=family -> "family"
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

    // Custom domain or production
    if (hostname.includes("simplinschool.com")) {
      return `https://${targetPortal}.simplinschool.com`;
    }
  }

  // Fallback defaults
  if (targetPortal === "staff") {
    return "https://staff.simplinschool.com";
  }
  return "https://family.simplinschool.com";
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
