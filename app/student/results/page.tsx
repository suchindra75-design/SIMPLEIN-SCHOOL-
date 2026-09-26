import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getStudentResult } from "@/lib/services/marks";
import { listExams } from "@/lib/services/exams";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Student results: own + PUBLISHED only (reuses Phase 6 result logic). */
export default async function StudentResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);
  if (scope === null) {
    return (
      <main>
        <h2 className="text-xl font-semibold">Results</h2>
        <div className="mt-4">
          <EmptyState message="No student profile is linked to your login yet." />
        </div>
      </main>
    );
  }
  const { exams } = await listExams(db, ctx, { page: 1, limit: 50 });
  const requestedExam = sp["examId"];
  const examId =
    requestedExam !== undefined &&
    UUID_RE.test(requestedExam) &&
    exams.some((e) => e.id === requestedExam)
      ? requestedExam
      : (exams[0]?.id ?? "");

  let result: Awaited<ReturnType<typeof getStudentResult>> | null = null;
  let loadError: string | undefined;
  if (examId !== "") {
    try {
      result = await getStudentResult(db, ctx, scope.studentId, examId);
    } catch (error) {
      // Unpublished results → controlled message (service 404 boundary).
      loadError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Results</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.school.name} · Published results only
      </p>

      <form method="get" className="mt-4">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Exam</span>
          <select name="examId" defaultValue={examId} className="rounded border px-2 py-1.5">
            <option value="">Select…</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
          View
        </button>
      </form>

      {loadError !== undefined && (
        <p role="alert" className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          {loadError === "Results are not published yet"
            ? "Results for this exam are not published yet."
            : loadError}
        </p>
      )}

      {result !== null && (
        <div className="mt-4 max-w-2xl">
          <p className="font-semibold">
            {result.displayName}{" "}
            <span className="font-normal text-gray-600">
              · {result.admissionNo} · {exams.find((e) => e.id === examId)?.name}
            </span>
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="py-2">Subject</th>
                <th>Marks</th>
                <th>Max</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {result.subjects.map((s) => (
                <tr key={s.subjectId} className="border-b">
                  <td className="py-2">{s.subjectName}</td>
                  <td>{s.isAbsent ? "AB" : (s.marksObtained ?? "—")}</td>
                  <td>{s.maxMarks}</td>
                  <td>{s.grade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-4 text-sm">
            <div className="rounded border p-3">
              <p className="text-xs text-gray-600">Total</p>
              <p className="text-xl font-bold">
                {result.totalObtained} / {result.maxTotal}
              </p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs text-gray-600">Percentage</p>
              <p className="text-xl font-bold">
                {result.percentage === null ? "—" : `${result.percentage}%`}
              </p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs text-gray-600">Grade</p>
              <p className="text-xl font-bold">{result.overallGrade ?? "—"}</p>
            </div>
          </div>
        </div>
      )}
      <p className="mt-4 text-sm">
        <Link href="/student" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
