import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getCurrentUser,
  roleHome,
  type SessionContext,
} from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/rbac";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  detectPortal,
  getPortalBaseUrl,
  isRoleAllowedForPortal,
  type PortalType,
} from "@/lib/auth/portal";

/**
 * Server-side dashboard gate. Runs on every request to a protected layout:
 * - anonymous → /login (middleware also redirects; this is the enforced check)
 * - inactive/unprovisioned → session terminated → /login?error=disabled
 * - wrong portal → safely redirects cross-subdomain to the authorized portal
 * - wrong role within portal → their own dashboard home
 */
export async function requireDashboard(
  expected: AppRole,
  next: string,
): Promise<SessionContext> {
  let ctx;
  try {
    ctx = await getCurrentUser();
  } catch {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    redirect("/login?error=disabled");
  }
  if (ctx === null) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Check portal context
  try {
    const headerStore = await headers();
    const portalHeader = headerStore.get("x-portal") as PortalType | null;
    const host = headerStore.get("x-portal-host") || headerStore.get("host");
    const portal = portalHeader ?? detectPortal(host);

    if (portal === "staff" && !isRoleAllowedForPortal("staff", ctx.roles)) {
      // Family role on staff portal -> redirect to family portal
      const targetBase = getPortalBaseUrl("family", host);
      redirect(`${targetBase}${roleHome(ctx.roles)}`);
    }

    if (portal === "family" && !isRoleAllowedForPortal("family", ctx.roles)) {
      // Staff role on family portal -> redirect to staff portal
      const targetBase = getPortalBaseUrl("staff", host);
      redirect(`${targetBase}${roleHome(ctx.roles)}`);
    }
  } catch (e: unknown) {
    // If NEXT_REDIRECT was thrown, re-throw it!
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      typeof (e as { digest: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    // Otherwise fallback gracefully in environments without headers()
  }

  if (!ctx.roles.includes(expected)) {
    redirect(roleHome(ctx.roles));
  }
  return ctx;
}
