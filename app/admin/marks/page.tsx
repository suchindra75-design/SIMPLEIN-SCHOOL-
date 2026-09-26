import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import {
  setMarksLockedAction,
  setResultsPublishedAction,
} from "@/app/admin/actions";
import { ConfirmButton } from "@/app/admin/_components/forms";
import { MarksEntry } from "@/app/components/MarksEntry";
import { listExams } from "@/lib/services/exams";
import { listMarkableSubjects } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminMarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 100 });
  const examId = sp["examId"] !== undefined && UUID_RE.test(sp["examId"]) ? sp["examId"] : (exams[0]?.id ?? "");
  const { subjects } =
    examId === ""
      ? { subjects: [] }
      : await listMarkableSubjects(db, ctx, examId);

  return (
    <main>
      <h2 className="text-xl font-semibold">Marks & results</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.school.name} · Review, lock/unlock, publish/unpublish
      </p>

      {exams.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No exams yet. Create an exam first." />
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

          <h3 className="mb-2 mt-6 font-semibold">Subjects</h3>
          {subjects.length === 0 ? (
            <p className="text-sm text-gray-500">
              No subjects configured for this exam.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {subjects.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 rounded border p-3">
                  <Link
                    href={`/admin/marks?examId=${examId}&subjectId=${s.id}`}
                    className={`font-medium underline ${sp["subjectId"] === s.id ? "text-blue-700" : ""}`}
                  >
                    {s.subjects?.name ?? "Subject"}
                  </Link>
                  <span className="text-gray-600">
                    Max {s.maxMarks} · Passing {s.passingMarks}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      s.isLocked ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {s.isLocked ? "Locked" : "Editable"}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      s.isPublished ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {s.isPublished ? "Published" : "Unpublished"}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <ConfirmButton
                      label={s.isLocked ? "Unlock" : "Lock"}
                      confirmMessage={`${s.isLocked ? "Unlock" : "Lock"} marks for ${s.subjects?.name ?? "this subject"}?`}
                      run={setMarksLockedAction.bind(null, s.id, !s.isLocked)}
                    />
                    <ConfirmButton
                      label={s.isPublished ? "Unpublish" : "Publish"}
                      confirmMessage={`${s.isPublished ? "Unpublish" : "Publish"} results for ${s.subjects?.name ?? "this subject"}?`}
                      run={setResultsPublishedAction.bind(null, s.id, !s.isPublished)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {sp["subjectId"] !== undefined && UUID_RE.test(sp["subjectId"]) && (
            <div className="mt-6">
              <h3 className="mb-2 font-semibold">Marks review</h3>
              <MarksEntry examSubjectId={sp["subjectId"]} />
            </div>
          )}
          <p className="mt-4 text-sm text-gray-600">
            Pick a subject above to review/edit its marks grid.{" "}
            <Link href="/admin" className="underline">
              Back
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
