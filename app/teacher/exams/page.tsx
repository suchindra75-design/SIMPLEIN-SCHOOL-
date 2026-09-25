import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listExams } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Teacher view: exam schedule for exams whose class contains an assigned section. */
export default async function TeacherExamsPage() {
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 50 });

  return (
    <main>
      <h2 className="text-xl font-semibold">Exams</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Exams for your assigned
        classes only
      </p>
      {exams.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No exams scheduled for your assigned classes yet." />
        </div>
      ) : (
        <ul className="mt-4 space-y-4 text-sm">
          {exams.map((e) => (
            <li key={e.id} className="rounded border p-4">
              <p className="font-semibold">
                {e.name}{" "}
                <span className="font-normal text-gray-600">
                  · {e.classes?.name ?? ""} · {e.startsOn} → {e.endsOn}
                </span>
              </p>
              {(e.subjects ?? []).length === 0 ? (
                <p className="mt-2 text-gray-500">No subjects scheduled.</p>
              ) : (
                <table className="mt-2 w-full">
                  <thead>
                    <tr className="border-b text-left text-gray-600">
                      <th className="py-1">Subject</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Max</th>
                      <th>Passing</th>
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
                        <td>{s.passingMarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm">
        <Link href="/teacher" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
