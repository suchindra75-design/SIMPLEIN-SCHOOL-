"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Server actions for login/logout. Supabase Auth owns credentials and
 * password policy — no password is ever stored in the application database.
 */

export async function loginAction(formData: FormData): Promise<never> {
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
    redirect("/login?error=invalid");
  }

  const { resolveIdentifierToEmail } = await import("@/lib/services/identity");
  const resolved = await resolveIdentifierToEmail(role, rawIdentifier);

  if (resolved === null || !resolved.email) {
    redirect("/login?error=invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  });

  if (error !== null) {
    redirect("/login?error=invalid");
  }

  let ctx;
  try {
    ctx = await getCurrentUser();
  } catch {
    await supabase.auth.signOut();
    redirect("/login?error=disabled");
  }
  if (ctx === null) {
    redirect("/login?error=invalid");
  }
  redirect(roleHome(ctx.roles));
}

export async function logoutAction(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
