import { publicErrorMessage } from "@/lib/errors/public-error";
import { requireRole } from "@/lib/auth/session";
import { ReportCardView } from "@/app/components/ReportCardView";
import { PrintButton } from "@/app/components/ReportCardButtons";
import { buildReportCard } from "@/lib/services/report-cards";
import { listExams } from "@/lib/services/exams";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Student report cards: own + PUBLISHED only (reuses Phase 7 logic). */
export default async function StudentReportCardsPage({
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
      <div>
        <h1 className="page-title">Report cards</h1>
        <div className="mt-4">
          <EmptyState message="No student profile is linked to your login yet." />
        </div>
      </div>
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

  let preview: Awaited<ReturnType<typeof buildReportCard>> | null = null;
  let loadError: string | undefined;
  if (examId !== "") {
    try {
      // Self-only + published-only (Phase 7 logic reused via the service).
      preview = await buildReportCard(db, ctx, scope.studentId, examId);
    } catch (error) {
      loadError = publicErrorMessage(error, "page:/student/report-cards");
    }
  }

  return (
    <div>
      <h1 className="page-title">Report cards</h1>
      <p className="mt-1 text-sm text-gray-600">{ctx.school.name} · Published only</p>

      <form method="get" className="mt-4">
        <label className="text-sm">
          <span className="ui-label">Exam</span>
          <select name="examId" defaultValue={examId} className="ui-input">
            <option value="">Select…</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-btn ui-btn-primary ml-3">
          View
        </button>
      </form>

      {loadError !== undefined && (
        <p role="alert" className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          {loadError}
        </p>
      )}

      {preview !== null && (
        <div className="mt-6">
          <div className="mb-2">
            <PrintButton />
          </div>
          <ReportCardView data={preview} />
        </div>
      )}
    </div>
  );
}
