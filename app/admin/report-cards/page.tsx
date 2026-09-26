import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { ReportCardView } from "@/app/components/ReportCardView";
import { DownloadPdfButton, PrintButton } from "@/app/components/ReportCardButtons";
import { listExams } from "@/lib/services/exams";
import {
  buildReportCard,
  listReportCards,
} from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 100 });
  const examId = sp["examId"] !== undefined && UUID_RE.test(sp["examId"]) ? sp["examId"] : (exams[0]?.id ?? "");
  const { reportCards } =
    examId === "" ? { reportCards: [] } : await listReportCards(db, ctx, examId);

  // Preview target: ?studentId= (or the first generated card).
  const previewId = sp["studentId"] ?? (reportCards[0]?.studentId ?? "");
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
        {ctx.school.name} · Generate → preview → download/print
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

          <h3 className="mb-2 mt-6 font-semibold">Generated cards</h3>
          {reportCards.length === 0 ? (
            <p className="text-sm text-gray-500">
              No report cards generated for this exam yet. Generate from a
              student marks page or the student list.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {reportCards.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded border p-3">
                  <Link
                    href={`/admin/report-cards?examId=${examId}&studentId=${r.studentId}`}
                    className="font-medium underline"
                  >
                    {r.students?.displayName ?? "Student"}
                  </Link>
                  <span className="text-gray-600">
                    {r.students?.admissionNo ?? ""} · {r.totalObtained}/{r.maxTotal}
                    {r.percentage === null ? "" : ` · ${r.percentage}%`}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      r.status === "PUBLISHED"
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="ml-auto">
                    <DownloadPdfButton reportCardId={r.id} />
                  </span>
                </li>
              ))}
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
                <DownloadPdfButton reportCardId={preview.reportCard.id} />
              </div>
              <ReportCardView data={preview} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
