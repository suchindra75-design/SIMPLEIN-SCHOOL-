import { requireRole } from "@/lib/auth/session";
import { MarksEntry } from "@/app/components/MarksEntry";
import { listExams } from "@/lib/services/exams";
import { listMarkableSubjects } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Teacher view: exam selector → authorized subjects → marks grid + save. */
export default async function TeacherMarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 50 });
  const examId = sp["examId"] !== undefined && UUID_RE.test(sp["examId"]) ? sp["examId"] : (exams[0]?.id ?? "");
  const { subjects } =
    examId === "" ? { subjects: [] } : await listMarkableSubjects(db, ctx, examId);

  return (
    <main>
      <h2 className="text-xl font-semibold">Marks</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Your authorized subjects only
      </p>

      {exams.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No exams scheduled for your assigned classes yet." />
        </div>
      ) : (
        <>
          <form method="get" className="mt-4">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Exam</span>
              <select name="examId" defaultValue={examId} className="rounded border px-2 py-1.5">
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.classes?.name ? ` · ${e.classes.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
              View
            </button>
          </form>

          <h3 className="mb-2 mt-6 font-semibold">Your subjects</h3>
          {subjects.length === 0 ? (
            <EmptyState message="No exam subjects are assigned to you for this exam." />
          ) : (
            <ul className="space-y-2 text-sm">
              {subjects.map((s) => (
                <li key={s.id} className="rounded border p-3">
                  <a
                    href={`/teacher/marks?examId=${examId}&subjectId=${s.id}`}
                    className="font-medium underline"
                  >
                    {s.subjects?.name ?? "Subject"}
                  </a>
                  <span className="text-gray-600">
                    {" "}
                    · Max {s.maxMarks} · Passing {s.passingMarks}
                  </span>
                  {s.isLocked && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Locked
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {sp["subjectId"] !== undefined && UUID_RE.test(sp["subjectId"]) && (
            <div className="mt-6">
              <h3 className="mb-2 font-semibold">Enter marks</h3>
              <MarksEntry examSubjectId={sp["subjectId"]} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
