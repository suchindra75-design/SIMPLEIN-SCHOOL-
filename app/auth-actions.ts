"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser, roleHome } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { passwordUpdateSchema } from "@/lib/validation/auth";
import {
  detectPortal,
  isRoleAllowedForPortal,
  validateSafeRedirect,
  type PortalType,
} from "@/lib/auth/portal";

const LOGIN_ROLES = ["STUDENT", "PARENT", "TEACHER", "ADMIN", "SCHOOL_ADMIN"] as const;
type LoginRole = (typeof LOGIN_ROLES)[number];

function normalizeRole(raw: string | null): LoginRole {
  const upper = raw?.toUpperCase() ?? "ADMIN";
  return (LOGIN_ROLES as readonly string[]).includes(upper) ? (upper as LoginRole) : "ADMIN";
}

/** Canonical origin for recovery links: configured app URL, else the request host. */
async function appOrigin(): Promise<string> {
  const configured = process.env["NEXT_PUBLIC_APP_URL"];
  if (configured !== undefined && configured !== "") return configured.replace(/\/+$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    return host !== null ? `${proto}://${host}` : "";
  } catch {
    return "";
  }
}

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

/**
 * Step 1 of password recovery: email a reset link to the account behind the
 * given identifier. Supabase Auth owns the token and the email. This action
 * NEVER reveals whether an account exists — it always ends on the same neutral
 * "if an account exists, we've sent a link" screen (no account enumeration).
 * Sending requires SMTP configured on the Supabase project; the redirect
 * target must be in the project's redirect allow-list (see DEPLOY_RUNBOOK.md).
 */
export async function requestPasswordResetAction(formData: FormData): Promise<never> {
  const role = normalizeRole(formData.get("role") as string | null);
  const identifier = ((formData.get("identifier") as string | null) ?? "").trim();
  const done = "/forgot-password?sent=1";

  if (identifier !== "") {
    let email: string | null = null;
    try {
      const { resolveIdentifierToEmail } = await import("@/lib/services/identity");
      const resolved = await resolveIdentifierToEmail(role, identifier);
      email = resolved?.email ?? null;
    } catch {
      email = null;
    }
    if (email !== null) {
      try {
        const origin = await appOrigin();
        const supabase = await createServerSupabaseClient();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });
      } catch {
        // Never surface send failures — would leak account existence.
      }
    }
  }
  redirect(done); // outside try/catch so NEXT_REDIRECT is not swallowed
}

/**
 * Step 2 of password recovery: set a new password. Requires the recovery
 * session established by /auth/callback (exchangeCodeForSession). Validates
 * strength locally (Supabase Auth also enforces its own policy), updates the
 * password, signs out, and returns the user to the login screen.
 */
export async function updatePasswordAction(formData: FormData): Promise<never> {
  const parsed = passwordUpdateSchema.safeParse({
    password: (formData.get("password") as string | null) ?? "",
    confirmPassword: (formData.get("confirmPassword") as string | null) ?? "",
  });
  if (!parsed.success) {
    redirect("/reset-password?error=weak");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error !== null) {
    // No valid recovery session (expired/invalid link) or password rejected.
    redirect("/reset-password?error=expired");
  }
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}
