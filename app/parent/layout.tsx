import { ShellHeader } from "@/app/components/ShellHeader";
import { requireDashboard } from "@/lib/auth/dashboard";

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
    <div data-shell="PARENT">
      <ShellHeader
        role="PARENT"
        name={ctx.profile.fullName}
        school={ctx.school}
        nav={[
          "Dashboard",
          "My Children",
          "Academics",
          "Attendance",
          "Results",
          "Timetable",
          "Homework",
          "Notices",
          "Fees",
          "Profile",
        ]}
      />
      <div className="p-4">{children}</div>
    </div>
  );
}
