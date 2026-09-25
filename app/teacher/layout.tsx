import { ShellHeader } from "@/app/components/ShellHeader";
import { requireDashboard } from "@/lib/auth/dashboard";

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
    <div data-shell="TEACHER">
      <ShellHeader
        role="TEACHER"
        name={ctx.profile.fullName}
        school={ctx.school}
        nav={[
          "Dashboard",
          "My Classes",
          "Students",
          "Attendance",
          "Exams/Marks",
          "Homework",
          "Timetable",
          "Notices",
          "Profile",
        ]}
      />
      <div className="p-4">{children}</div>
    </div>
  );
}
