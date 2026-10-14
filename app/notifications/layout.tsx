import { requireDashboard } from "@/lib/auth/dashboard";
import { getCurrentUser } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/rbac";
import { AppShell } from "@/components/shell/AppShell";
import type { ShellRole } from "@/components/shell/nav-config";

/** Authenticated shell — never statically prerendered (session required). */
export const dynamic = "force-dynamic";

const ROLE_PRIORITY: ShellRole[] = ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"];

function primaryRole(roles: readonly AppRole[]): ShellRole {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "STUDENT";
}

/**
 * The notification inbox is shared by every role. Render it inside the
 * caller's own portal shell; requireDashboard keeps the same login, account
 * and portal checks as the role layouts, and the page re-checks requireRole.
 */
export default async function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let role: ShellRole = "STUDENT";
  try {
    const current = await getCurrentUser();
    if (current !== null) role = primaryRole(current.roles);
  } catch {
    // requireDashboard below handles unprovisioned or disabled accounts.
  }
  const ctx = await requireDashboard(role, "/notifications");

  return (
    <AppShell role={role} schoolName={ctx.school.name} userName={ctx.profile.fullName}>
      {children}
    </AppShell>
  );
}
