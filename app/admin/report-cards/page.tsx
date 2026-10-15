import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { ReportCardView } from "@/app/components/ReportCardView";
import { DownloadPdfButton, PrintButton } from "@/app/components/ReportCardButtons";
import { generateExamReportCardsAction, generateReportCardAction } from "@/app/admin/actions";
import { ActionButton } from "@/app/admin/_components/forms";
import { EmptyState, PageHeader, SectionCard } from "@/app/admin/_components/ui";
import { listExams } from "@/lib/services/exams";
import { getClassRoster } from "@/lib/services/marks";
import { buildReportCard, listReportCards } from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Report cards" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Report cards per exam: generate (one student or the whole class) → preview →
 * download/print. A card is PUBLISHED when every subject's results are
 * published; families only ever see published cards.
 */
export default async function AdminReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, { page: 1, limit: 100 });
  const examId =
    sp["examId"] !== undefined && UUID_RE.test(sp["examId"]) ? sp["examId"] : (exams[0]?.id ?? "");
  const exam = exams.find((e) => e.id === examId);

  const { reportCards } =
    examId === "" ? { reportCards: [] } : await listReportCards(db, ctx, examId);
  const roster =
    exam === undefined ? [] : await getClassRoster(db, ctx, exam.classId, exam.academicYearId);
  const cardByStudent = new Map(reportCards.map((r) => [r.studentId, r]));

  const previewId = sp["studentId"] !== undefined && UUID_RE.test(sp["studentId"]) ? sp["studentId"] : "";
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
    <div className="space-y-6">
      <PageHeader
        title="Report cards"
        description="Generate report cards for an exam, preview them and download the PDF. Families see a card once every subject's results are published."
      />

      {exams.length === 0 ? (
        <EmptyState title="No exams yet" message="Create an exam and enter marks before generating report cards." />
      ) : (
        <>
          <form method="get" className="ui-card flex flex-wrap items-end gap-3 p-4">
            <label className="text-sm">
              <span className="ui-label">Exam</span>
              <select name="examId" defaultValue={examId} className="ui-input">
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.classes?.name ? ` · ${e.classes.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ui-btn ui-btn-secondary">
              Show
            </button>
          </form>

          <SectionCard title={`Students${exam?.classes?.name ? ` · ${exam.classes.name}` : ""}`}>
            {roster.length === 0 ? (
              <EmptyState message="No students are enrolled in this exam's class for its academic year." />
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {reportCards.length} of {roster.length} generated
                  </span>
                  <span className="ml-auto">
                    <ActionButton
                      label={reportCards.length === 0 ? "Generate all" : "Regenerate all"}
                      pendingLabel="Generating…"
                      run={generateExamReportCardsAction.bind(null, examId)}
                    />
                  </span>
                </div>
                <div className="ui-table-wrap">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Admission no.</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((s) => {
                        const card = cardByStudent.get(s.id);
                        return (
                          <tr key={s.id}>
                            <td>
                              <Link
                                href={`/admin/report-cards?examId=${examId}&studentId=${s.id}`}
                                className="font-medium text-foreground underline-offset-2 hover:underline"
                              >
                                {s.displayName}
                              </Link>
                            </td>
                            <td>{s.admissionNo}</td>
                            <td>
                              {card === undefined
                                ? "—"
                                : `${card.totalObtained}/${card.maxTotal}${card.percentage === null ? "" : ` · ${card.percentage}%`}`}
                            </td>
                            <td>
                              {card === undefined ? (
                                <span className="ui-badge ui-badge-neutral">Not generated</span>
                              ) : card.status === "PUBLISHED" ? (
                                <span className="ui-badge ui-badge-success">Published</span>
                              ) : (
                                <span className="ui-badge ui-badge-warning">Draft</span>
                              )}
                            </td>
                            <td>
                              <span className="flex flex-wrap items-center justify-end gap-2">
                                <ActionButton
                                  label={card === undefined ? "Generate" : "Regenerate"}
                                  pendingLabel="Generating…"
                                  run={generateReportCardAction.bind(null, s.id, examId)}
                                />
                                {card !== undefined && <DownloadPdfButton reportCardId={card.id} />}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>

          {previewError !== undefined && (
            <p role="alert" className="ui-alert ui-alert-error">
              {previewError}
            </p>
          )}
          {preview !== null && (
            <SectionCard title="Preview">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <PrintButton />
                <DownloadPdfButton reportCardId={preview.reportCard.id} />
              </div>
              <ReportCardView data={preview} />
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
