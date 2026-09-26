import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listChildExamSchedule } from "@/lib/services/exams";
import { getStudentResult } from "@/lib/services/marks";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parent view: child selector + PUBLISHED results only (server-enforced). */
export default async function ParentResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const scope = await getParentScope(db, ctx);
  const { children } =
    scope === null ? { children: [] } : await listChildren(db, ctx, scope.parentId);

  const requested = sp["studentId"];
  // Scope guard: only linked children are ever viewable (server-enforced).
  const selectedId =
    requested !== undefined && children.some((c) => c.id === requested)
      ? requested
      : (children[0]?.id ?? "");
  const selected = children.find((c) => c.id === selectedId);

  // Exam selector: active exams for the child's class.
  const { exams } =
    selectedId === ""
      ? { exams: [] }
      : await listChildExamSchedule(db, ctx, selectedId);
  const requestedExam = sp["examId"];
  const examId =
    requestedExam !== undefined && UUID_RE.test(requestedExam) && exams.some((e) => e.id === requestedExam)
      ? requestedExam
      : (exams[0]?.id ?? "");

  let result: Awaited<ReturnType<typeof getStudentResult>> | null = null;
  let loadError: string | undefined;
  if (selectedId !== "" && examId !== "") {
    try {
      result = await getStudentResult(db, ctx, selectedId, examId);
    } catch (error) {
      // Unpublished results surface as NotFoundError → controlled message.
      loadError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Results</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name}
      </p>

      {scope === null ? (
        <p className="mt-4 text-sm text-gray-600">
          No parent profile is linked to your login yet.
        </p>
      ) : children.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No children are linked to your account yet." />
        </div>
      ) : (
        <>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Child</span>
              <select name="studentId" defaultValue={selectedId} className="rounded border px-2 py-1.5">
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.classes?.name ? ` · ${c.classes.name}` : ""}
                    {c.sections?.name ? ` ${c.sections.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
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
            <button type="submit" className="rounded border px-3 py-1.5 text-sm">
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
                      <td>
                        {s.isAbsent ? "AB" : (s.marksObtained ?? "—")}
                      </td>
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
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href="/parent" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
