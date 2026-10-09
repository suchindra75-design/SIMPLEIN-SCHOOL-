import { requireRole } from "@/lib/auth/session";
import { getStudentSummary, getStudentAttendance } from "@/lib/services/attendance";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student attendance: own data only (read-only). */
export default async function StudentAttendancePage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);
  if (scope === null) {
    return (
      <main>
        <h2 className="text-xl font-semibold">My attendance</h2>
        <div className="mt-4">
          <EmptyState message="No student profile is linked to your login yet." />
        </div>
      </main>
    );
  }
  const [summary, { records }] = await Promise.all([
    getStudentSummary(db, ctx, scope.studentId, {}),
    getStudentAttendance(db, ctx, scope.studentId, {
      page: 1,
      limit: 100,
    }),
  ]);

  return (
    <main>
      <h2 className="text-xl font-semibold">My attendance</h2>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="rounded border p-3">
          <p className="text-xs text-gray-600">Present</p>
          <p className="text-xl font-bold">{summary.present}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-600">Absent</p>
          <p className="text-xl font-bold">{summary.absent}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-600">Leave</p>
          <p className="text-xl font-bold">{summary.leave}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-600">Attendance</p>
          <p className="text-xl font-bold">
            {summary.percentage === null ? "—" : `${summary.percentage}%`}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Percentage = Present ÷ (Present + Absent). Approved Leave is excused.
      </p>
      <h3 className="mb-2 mt-6 font-semibold">Daily history</h3>
      {records.length === 0 ? (
        <EmptyState message="No attendance recorded yet." />
      ) : (
        <table className="w-full max-w-md text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2">Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.sessionId + r.date} className="border-b">
                <td className="py-2">{r.date}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
