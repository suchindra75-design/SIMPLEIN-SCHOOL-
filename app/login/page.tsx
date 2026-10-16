import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { getCurrentUser, roleHome } from "@/lib/auth/session";
import {
  detectPortal,
  getPortalBaseUrl,
  isRoleAllowedForPortal,
  validateSafeRedirect,
  type PortalType,
} from "@/lib/auth/portal";

/** Session-aware page — never statically prerendered. */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; portal?: string }>;
}) {
  const params = await searchParams;

  let portal: PortalType = "unified";
  let host = "";

  try {
    const headerStore = await headers();
    const portalHeader = headerStore.get("x-portal") as PortalType | null;
    host = headerStore.get("x-portal-host") || headerStore.get("host") || "";
    portal = portalHeader ?? detectPortal(host, params.portal);
  } catch {
    portal = detectPortal(null, params.portal);
  }

  // If already signed in:
  try {
    const ctx = await getCurrentUser();
    if (ctx !== null) {
      // If signed in, verify they match the current portal
      if (portal === "staff" && !isRoleAllowedForPortal("staff", ctx.roles)) {
        // Redirect to family portal
        const familyUrl = getPortalBaseUrl("family", host);
        redirect(`${familyUrl}${roleHome(ctx.roles)}`);
      } else if (portal === "family" && !isRoleAllowedForPortal("family", ctx.roles)) {
        // Redirect to staff portal
        const staffUrl = getPortalBaseUrl("staff", host);
        redirect(`${staffUrl}${roleHome(ctx.roles)}`);
      } else {
        const safeDestination = validateSafeRedirect(params.next, roleHome(ctx.roles));
        redirect(safeDestination);
      }
    }
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      typeof (e as { digest: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    // Inactive/unprovisioned: fall through to show the login form
  }

  // "" = no trusted origin for this host: link to the portal on this origin.
  const staffBaseUrl = getPortalBaseUrl("staff", host) || "/login?portal=staff";
  const familyBaseUrl = getPortalBaseUrl("family", host) || "/login?portal=family";

  return (
    <LoginForm
      initialError={params.error}
      initialPortal={portal}
      nextPath={params.next}
      staffBaseUrl={staffBaseUrl}
      familyBaseUrl={familyBaseUrl}
      currentHost={host}
    />
  );
}
