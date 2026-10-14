import { requireDashboard } from "@/lib/auth/dashboard";
import { AppShell } from "@/components/shell/AppShell";

/** Authenticated shell — never statically prerendered (session required). */
export const dynamic = "force-dynamic";

/**
 * School Admin shell. Server-enforced requireRole(SCHOOL_ADMIN);
 * every API route re-enforces auth + RBAC + tenant scope independently.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireDashboard("SCHOOL_ADMIN", "/admin");

  return (
    <AppShell role="SCHOOL_ADMIN" schoolName={ctx.school.name} userName={ctx.profile.fullName}>
      {children}
    </AppShell>
  );
}
