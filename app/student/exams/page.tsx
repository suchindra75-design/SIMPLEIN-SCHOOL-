import { requireRole } from "@/lib/auth/session";
import { listExams } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student exams: own class's exams (read-only). */
export default async function StudentExamsPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 50, withSubjects: true });

  return (
    <div>
      <h1 className="page-title">Exams</h1>
      <p className="mt-1 text-sm text-gray-600">{ctx.school.name} · Your class exams</p>
      {exams.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No exams scheduled for your class yet." />
        </div>
      ) : (
        <ul className="mt-4 space-y-4 text-sm">
          {exams.map((e) => (
            <li key={e.id} className="rounded border p-4">
              <p className="font-semibold">
                {e.name}{" "}
                <span className="font-normal text-gray-600">
                  · {e.startsOn} → {e.endsOn}
                </span>
              </p>
              {(e.subjects ?? []).length === 0 ? (
                <p className="mt-2 text-gray-500">No subjects scheduled.</p>
              ) : (
                <div className="ui-table-wrap mt-2">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-gray-600">
                        <th className="py-1">Subject</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(e.subjects ?? []).map((s) => (
                        <tr key={s.id} className="border-b">
                          <td className="py-1">{s.subjects?.name ?? "—"}</td>
                          <td>{s.examDate ?? "—"}</td>
                          <td>
                            {s.startTime === null
                              ? "—"
                              : `${s.startTime}${s.endTime ? `–${s.endTime}` : ""}`}
                          </td>
                          <td>{s.maxMarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
