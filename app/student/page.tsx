import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { UnreadBadge } from "@/app/components/UnreadBadge";
import { WeeklyTimetable } from "@/app/components/WeeklyTimetable";
import { listMyTimetable } from "@/lib/services/timetable";
import { listNotices } from "@/lib/services/notices";
import { listHomework } from "@/lib/services/homework";
import { listExams } from "@/lib/services/exams";
import { getStudentSummary, getStudentAttendance } from "@/lib/services/attendance";
import { listStudentFees } from "@/lib/services/fees";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student dashboard: self-only data (attendance, exams, homework, fees, notices). */
export default async function StudentDashboardPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);

  if (scope === null) {
    return (
      <main>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <div className="mt-4">
          <EmptyState message="No student profile is linked to your login yet. Contact your school administrator." />
        </div>
      </main>
    );
  }

  const [
    attendance,
    { exams },
    { homework },
    { notices },
    { slots },
    { fees },
    { records: recentAttendance },
  ] = await Promise.all([
    getStudentSummary(db, ctx, scope.studentId, {}),
    listExams(db, ctx, { page: 1, limit: 5 }),
    listHomework(db, ctx, { page: 1, limit: 5 }),
    listNotices(db, ctx, { page: 1, limit: 5 }),
    listMyTimetable(db, ctx),
    listStudentFees(db, ctx, scope.studentId),
    getStudentAttendance(db, ctx, scope.studentId, { page: 1, limit: 5 }),
  ]);
  const feeDue = fees.reduce((sum, f) => sum + f.due, 0);

  return (
    <main>
      <h2 className="text-xl font-semibold">My dashboard</h2>
      <div className="mt-1 flex items-center gap-3">
        <p className="text-sm text-gray-600">
          {ctx.profile.fullName} · {ctx.school.name}
        </p>
        <UnreadBadge />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/student/attendance" className="rounded border p-4 hover:bg-gray-50">
          <p className="text-2xl font-bold">
            {attendance.percentage === null ? "—" : `${attendance.percentage}%`}
          </p>
          <p className="text-sm text-gray-600">Attendance</p>
        </Link>
        <Link href="/student/fees" className="rounded border p-4 hover:bg-gray-50">
          <p className="text-2xl font-bold">{feeDue}</p>
          <p className="text-sm text-gray-600">Fee due</p>
        </Link>
        <Link href="/student/exams" className="rounded border p-4 hover:bg-gray-50">
          <p className="text-2xl font-bold">{exams.length}</p>
          <p className="text-sm text-gray-600">Exams</p>
        </Link>
        <Link href="/student/homework" className="rounded border p-4 hover:bg-gray-50">
          <p className="text-2xl font-bold">{homework.length}</p>
          <p className="text-sm text-gray-600">Homework</p>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 font-semibold">Recent attendance</h3>
          {recentAttendance.length === 0 ? (
            <EmptyState message="No attendance recorded yet." />
          ) : (
            <ul className="space-y-1 text-sm">
              {recentAttendance.map((r) => (
                <li key={r.sessionId + r.date} className="rounded border p-2">
                  {r.date} · {r.status}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Notices</h3>
          {notices.length === 0 ? (
            <EmptyState message="No notices for you yet." />
          ) : (
            <ul className="space-y-1 text-sm">
              {notices.map((n) => (
                <li key={n.id} className="rounded border p-2">
                  {n.title}{" "}
                  <span className="text-xs text-gray-500">({n.category})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h3 className="mb-2 font-semibold">My timetable</h3>
        <WeeklyTimetable slots={slots} />
      </section>

      <div className="mt-6 text-sm">
        <Link href="/student/pyqs" className="underline">
          PYQ quick access
        </Link>{" "}
        ·{" "}
        <Link href="/student/results" className="underline">
          Results
        </Link>{" "}
        ·{" "}
        <Link href="/student/academic-history" className="underline">
          Academic history
        </Link>
      </div>
    </main>
  );
}
