import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { UnreadBadge } from "@/app/components/UnreadBadge";
import {
  getTeacherScope,
  listTeacherSections,
} from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const scope = await getTeacherScope(db, ctx);
  const { sections } =
    scope === null
      ? { sections: [] }
      : await listTeacherSections(db, ctx, scope.teacherId);

  const quickActions = [
    { label: "Daily Attendance", href: "/teacher/attendance", desc: "Mark class and section attendance" },
    { label: "Exams & Tests", href: "/teacher/exams", desc: "View class exam schedules" },
    { label: "Marks Entry", href: "/teacher/marks", desc: "Enter & lock exam scores" },
    { label: "Report Cards", href: "/teacher/report-cards", desc: "Review student report cards" },
    { label: "Homework", href: "/teacher/homework", desc: "Assign homework & attachments" },
    { label: "Weekly Timetable", href: "/teacher/timetable", desc: "View assigned lecture schedule" },
    { label: "School Notices", href: "/teacher/notices", desc: "View announcements & circulars" },
    { label: "Notifications", href: "/notifications", desc: "Check alerts and messages" },
  ];

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Teacher Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">
            {ctx.profile.fullName} · {ctx.school.name}
          </p>
        </div>
        <UnreadBadge />
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-semibold text-gray-900">My Assigned Sections</h3>
        {scope === null ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-amber-700 bg-amber-50/50">
            No teacher profile is linked to your login yet. Contact your school administrator.
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500 bg-gray-50/50">
            No class or subject assignments yet. Contact your school administrator.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => (
              <div key={s.id} className="rounded-lg border bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900">
                      {s.classes?.name ?? ""} {s.name}
                    </h4>
                    {s.room && <p className="text-xs text-gray-500">Room: {s.room}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/teacher/attendance`}
                    className="rounded bg-blue-50 px-2.5 py-1 font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Attendance
                  </Link>
                  <Link
                    href={`/teacher/marks`}
                    className="rounded bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    Marks
                  </Link>
                  <Link
                    href={`/teacher/homework`}
                    className="rounded bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Homework
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="mb-3 mt-8 font-semibold text-gray-900">Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group rounded-lg border bg-white p-4 shadow-xs transition-all hover:border-blue-400 hover:shadow-sm"
          >
            <p className="font-semibold text-gray-900 group-hover:text-blue-600">
              {action.label} →
            </p>
            <p className="mt-1 text-xs text-gray-500">{action.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
