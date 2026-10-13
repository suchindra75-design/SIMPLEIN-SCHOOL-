"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser, roleHome } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  detectPortal,
  isRoleAllowedForPortal,
  validateSafeRedirect,
  type PortalType,
} from "@/lib/auth/portal";

/**
 * Server actions for login/logout. Supabase Auth owns credentials and
 * password policy — no password is ever stored in the application database.
 * Supports identifier-to-email resolution (admission number, staff code, phone, or email)
 * and portal-aware role isolation (staff vs family portal).
 */

export async function loginAction(formData: FormData): Promise<never> {
  // 1. Extract portal and redirect params
  const formPortal = formData.get("portal") as string | null;
  const rawNext = formData.get("next") as string | null;

  let portal: PortalType = "unified";
  try {
    const headerStore = await headers();
    const portalHeader = headerStore.get("x-portal") as PortalType | null;
    const host = headerStore.get("x-portal-host") || headerStore.get("host");
    portal = portalHeader ?? detectPortal(host, formPortal);
  } catch {
    portal = detectPortal(null, formPortal);
  }

  const loginErrorUrl = (errorKey: string) => {
    const params = new URLSearchParams();
    params.set("error", errorKey);
    if (formPortal && formPortal !== "unified") {
      params.set("portal", formPortal);
    }
    if (rawNext) {
      params.set("next", rawNext);
    }
    return `/login?${params.toString()}`;
  };

  // 2. Extract persona/role and credential identifiers
  const roleRaw = (formData.get("role") as string | null)?.toUpperCase() ?? "ADMIN";
  const role = ["STUDENT", "PARENT", "TEACHER", "ADMIN", "SCHOOL_ADMIN"].includes(roleRaw)
    ? (roleRaw as "STUDENT" | "PARENT" | "TEACHER" | "ADMIN" | "SCHOOL_ADMIN")
    : "ADMIN";

  const rawIdentifier =
    (formData.get("identifier") as string | null) ??
    (formData.get("email") as string | null) ??
    "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!rawIdentifier.trim() || !password) {
    redirect(loginErrorUrl("invalid"));
  }

  // 3. Resolve identifier (email, admission number, phone, staff code)
  const { resolveIdentifierToEmail } = await import("@/lib/services/identity");
  const resolved = await resolveIdentifierToEmail(role, rawIdentifier);

  if (resolved === null || !resolved.email) {
    redirect(loginErrorUrl("invalid"));
  }

  // 4. Authenticate via Supabase Auth
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  });

  if (error !== null) {
    redirect(loginErrorUrl("invalid"));
  }

  // 5. Verify application user profile and active status
  let ctx;
  try {
    ctx = await getCurrentUser();
  } catch {
    await supabase.auth.signOut();
    redirect(loginErrorUrl("disabled"));
  }
  if (ctx === null) {
    redirect(loginErrorUrl("invalid"));
  }

  // 6. Enforce portal role boundary
  if (!isRoleAllowedForPortal(portal, ctx.roles)) {
    await supabase.auth.signOut();
    if (portal === "staff") {
      redirect(loginErrorUrl("portal_mismatch_staff"));
    } else if (portal === "family") {
      redirect(loginErrorUrl("portal_mismatch_family"));
    }
  }

  // 7. Safe redirect destination (strictly prevents open redirects)
  const defaultHome = roleHome(ctx.roles);
  const targetDestination = validateSafeRedirect(rawNext, defaultHome);

  redirect(targetDestination);
}

export async function logoutAction(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
