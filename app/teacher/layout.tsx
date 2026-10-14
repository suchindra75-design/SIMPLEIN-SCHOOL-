import { requireDashboard } from "@/lib/auth/dashboard";
import { AppShell } from "@/components/shell/AppShell";

/** Authenticated shell — never statically prerendered (session required). */
export const dynamic = "force-dynamic";

/** Teacher shell. Server-enforced requireRole(TEACHER). */
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireDashboard("TEACHER", "/teacher");

  return (
    <AppShell role="TEACHER" schoolName={ctx.school.name} userName={ctx.profile.fullName}>
      {children}
    </AppShell>
  );
}
