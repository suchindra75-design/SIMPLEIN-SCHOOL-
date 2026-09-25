import { redirect } from "next/navigation";
import {
  getCurrentUser,
  roleHome,
  type SessionContext,
} from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/rbac";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server-side dashboard gate. Runs on every request to a protected layout:
 * - anonymous → /login (middleware also redirects; this is the enforced check)
 * - inactive/unprovisioned → session terminated → /login?error=disabled
 * - wrong role → their own dashboard home (students → dormant /student page)
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
  if (!ctx.roles.includes(expected)) {
    redirect(roleHome(ctx.roles));
  }
  return ctx;
}
