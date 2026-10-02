import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { UnreadBadge } from "@/app/components/UnreadBadge";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const scope = await getParentScope(db, ctx);
  const { children } =
    scope === null ? { children: [] } : await listChildren(db, ctx, scope.parentId);

  const quickActions = [
    { label: "Attendance Summary", href: "/parent/attendance", desc: "View daily attendance & percentages" },
    { label: "Exam Schedules", href: "/parent/exams", desc: "Upcoming dates & subject syllabus" },
    { label: "Published Results", href: "/parent/results", desc: "Subject marks and passing status" },
    { label: "Report Cards", href: "/parent/report-cards", desc: "Official PDF grade sheets" },
    { label: "Class Timetable", href: "/parent/timetable", desc: "Weekly period schedule" },
    { label: "Homework & Tasks", href: "/parent/homework", desc: "Assigned tasks & attachments" },
    { label: "School Notices", href: "/parent/notices", desc: "Official announcements" },
    { label: "Fee Records", href: "/parent/fees", desc: "Fee dues & payment receipts" },
  ];

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Parent Portal</h2>
          <p className="mt-1 text-sm text-gray-600">
            {ctx.profile.fullName} · {ctx.school.name}
          </p>
        </div>
        <UnreadBadge />
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-semibold text-gray-900">Enrolled Children</h3>
        {scope === null ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-amber-700 bg-amber-50/50">
            No parent profile is linked to your login yet. Contact your school administrator.
          </div>
        ) : children.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500 bg-gray-50/50">
            No children linked to your account yet. Contact your school administrator.
          </div>
        ) : (
          <div className="space-y-4">
            {children.map((c) => (
              <div key={c.id} className="rounded-lg border bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <h4 className="text-base font-bold text-gray-900">{c.displayName}</h4>
                    <p className="text-xs text-gray-600">
                      Admission No: <span className="font-medium">{c.admissionNo}</span> · {c.classes?.name ?? ""}{" "}
                      {c.sections?.name ? `(${c.sections.name})` : ""}
                      {c.rollNumber ? ` · Roll: ${c.rollNumber}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    Active Student
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/parent/attendance?studentId=${c.id}`}
                    className="rounded border bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Attendance
                  </Link>
                  <Link
                    href={`/parent/results?studentId=${c.id}`}
                    className="rounded border bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Results
                  </Link>
                  <Link
                    href={`/parent/report-cards?studentId=${c.id}`}
                    className="rounded border bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Report Cards
                  </Link>
                  <Link
                    href={`/parent/timetable?studentId=${c.id}`}
                    className="rounded border bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Timetable
                  </Link>
                  <Link
                    href={`/parent/homework?studentId=${c.id}`}
                    className="rounded border bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Homework
                  </Link>
                  <Link
                    href={`/parent/fees?studentId=${c.id}`}
                    className="rounded border bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Fees & Receipts
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="mb-3 mt-8 font-semibold text-gray-900">Quick Navigation</h3>
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
