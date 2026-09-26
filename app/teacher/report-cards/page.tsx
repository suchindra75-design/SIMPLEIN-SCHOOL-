import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { ReportCardView } from "@/app/components/ReportCardView";
import { PrintButton } from "@/app/components/ReportCardButtons";
import { listExams } from "@/lib/services/exams";
import { listStudents } from "@/lib/services/students";
import {
  buildReportCard,
  listReportCards,
} from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Teacher view: report cards for students in assigned classes. */
export default async function TeacherReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 50 });
  const examId = sp["examId"] !== undefined && UUID_RE.test(sp["examId"]) ? sp["examId"] : (exams[0]?.id ?? "");
  // Teacher-scoped student list (assigned sections only).
  const { students } =
    examId === ""
      ? { students: [] }
      : await listStudents(db, ctx, { page: 1, limit: 100 });
  const generated = examId === "" ? [] : (await listReportCards(db, ctx, examId)).reportCards;

  const previewId = sp["studentId"] ?? "";
  let preview: Awaited<ReturnType<typeof buildReportCard>> | null = null;
  let previewError: string | undefined;
  if (previewId !== "" && examId !== "") {
    try {
      preview = await buildReportCard(db, ctx, previewId, examId);
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Report cards</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Your assigned classes only
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

          <h3 className="mb-2 mt-6 font-semibold">Your students</h3>
          {students.length === 0 ? (
            <EmptyState message="No students in your assigned sections." />
          ) : (
            <ul className="space-y-2 text-sm">
              {students.map((s) => {
                const card = generated.find((g) => g.studentId === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 rounded border p-3">
                    <Link
                      href={`/teacher/report-cards?examId=${examId}&studentId=${s.id}`}
                      className="font-medium underline"
                    >
                      {s.displayName}
                    </Link>
                    <span className="text-gray-600">{s.admissionNo}</span>
                    {card !== undefined && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          card.status === "PUBLISHED"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {card.status}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {previewError !== undefined && (
            <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
              {previewError}
            </p>
          )}
          {preview !== null && (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-3">
                <h3 className="font-semibold">Preview</h3>
                <PrintButton />
              </div>
              <ReportCardView data={preview} />
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href="/teacher" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
