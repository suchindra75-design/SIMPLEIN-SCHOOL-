import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { ReportCardView } from "@/app/components/ReportCardView";
import { DownloadPdfButton, PrintButton } from "@/app/components/ReportCardButtons";
import { listChildExamSchedule } from "@/lib/services/exams";
import {
  buildReportCard,
  getReportCardPdfUrl,
} from "@/lib/services/report-cards";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parent view: child selector + PUBLISHED report cards (server-enforced). */
export default async function ParentReportCardsPage({
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
    requestedExam !== undefined &&
    UUID_RE.test(requestedExam) &&
    exams.some((e) => e.id === requestedExam)
      ? requestedExam
      : (exams[0]?.id ?? "");

  let preview: Awaited<ReturnType<typeof buildReportCard>> | null = null;
  let pdfUrl: string | null = null;
  let loadError: string | undefined;
  if (selectedId !== "" && examId !== "") {
    try {
      preview = await buildReportCard(db, ctx, selectedId, examId);
      if (preview.reportCard.id !== null) {
        pdfUrl = await getReportCardPdfUrl(db, ctx, preview.reportCard.id);
      }
    } catch (error) {
      // Unpublished results → controlled message (service 404 boundary).
      loadError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Report cards</h2>
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

          {preview !== null && (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-3">
                <h3 className="font-semibold">Report card</h3>
                <PrintButton />
                {pdfUrl !== null && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
                  >
                    Download PDF
                  </a>
                )}
              </div>
              <ReportCardView data={preview} />
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
