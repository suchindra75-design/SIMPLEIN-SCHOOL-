import { ShellHeader } from "@/app/components/ShellHeader";
import { requireDashboard } from "@/lib/auth/dashboard";

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
    <div data-shell="SCHOOL_ADMIN">
      <ShellHeader
        role="SCHOOL_ADMIN"
        name={ctx.profile.fullName}
        school={ctx.school}
        nav={[
          "Dashboard",
          "Students",
          "Parents",
          "Teachers",
          "Classes",
          "Attendance",
          "Exams",
          "Fees",
          "Settings",
        ]}
      />
      <div className="p-4">{children}</div>
    </div>
  );
}
