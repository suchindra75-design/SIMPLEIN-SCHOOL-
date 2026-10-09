import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { UnreadBadge } from "@/app/components/UnreadBadge";
import { listClasses } from "@/lib/services/classes";
import { listParents } from "@/lib/services/parents";
import { listStudents } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ total: students }, { total: teachers }, { total: parents }, { classes }] =
    await Promise.all([
      listStudents(db, ctx, { page: 1, limit: 1 }),
      listTeachers(db, ctx, { page: 1, limit: 1 }),
      listParents(db, ctx, { page: 1, limit: 1 }),
      listClasses(db, ctx),
    ]);

  const stats = [
    { label: "Students", count: students, href: "/admin/students" },
    { label: "Teachers", count: teachers, href: "/admin/teachers" },
    { label: "Parents", count: parents, href: "/admin/parents" },
    { label: "Classes", count: classes.length, href: "/admin/classes" },
  ];

  const quickActions = [
    { label: "Mark Attendance", href: "/admin/attendance", desc: "Daily class attendance records" },
    { label: "Exams & Schedules", href: "/admin/exams", desc: "Manage institutional exams" },
    { label: "Marks Entry & Locking", href: "/admin/marks", desc: "Review and lock marksheets" },
    { label: "Report Cards", href: "/admin/report-cards", desc: "Generate & publish PDF report cards" },
    { label: "Fee Management", href: "/admin/fees", desc: "Structures, dues & payments" },
    { label: "Timetable", href: "/admin/timetable", desc: "Section & teacher weekly schedule" },
    { label: "Homework", href: "/admin/homework", desc: "Assignments & attachments" },
    { label: "Notices & Circulars", href: "/admin/notices", desc: "Publish institutional notices" },
    { label: "Annual Promotions", href: "/admin/promotions", desc: "Promote student cohorts" },
    { label: "Past Year Papers", href: "/admin/pyqs", desc: "Question paper repository" },
    { label: "Users & Accounts", href: "/admin/users", desc: "Role grants & credentials" },
    { label: "Excel Student Import", href: "/admin/students/import", desc: "Bulk import roster" },
  ];

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Institutional Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">
            {ctx.profile.fullName} · {ctx.school.name}
          </p>
        </div>
        <UnreadBadge />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-lg border bg-white p-4 shadow-xs transition-colors hover:border-blue-500 hover:bg-blue-50/30"
          >
            <p className="text-3xl font-bold text-gray-900">{c.count}</p>
            <p className="text-sm font-medium text-gray-600">{c.label}</p>
          </Link>
        ))}
      </div>

      <h3 className="mb-3 mt-8 font-semibold text-gray-900">Operational Modules & Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
