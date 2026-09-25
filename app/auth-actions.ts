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
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
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
