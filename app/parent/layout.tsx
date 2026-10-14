import { requireDashboard } from "@/lib/auth/dashboard";
import { AppShell } from "@/components/shell/AppShell";

/** Authenticated shell — never statically prerendered (session required). */
export const dynamic = "force-dynamic";

/** Parent shell. Server-enforced requireRole(PARENT). */
export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireDashboard("PARENT", "/parent");

  return (
    <AppShell role="PARENT" schoolName={ctx.school.name} userName={ctx.profile.fullName}>
      {children}
    </AppShell>
  );
}
