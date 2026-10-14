import { requireRole } from "@/lib/auth/session";
import { promoteStudentsFormAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { previewPromotion } from "@/lib/services/promotions";
import { listAcademicYears } from "@/lib/services/years";
import { listClasses } from "@/lib/services/classes";
import { listSections } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Promotion workflow: select years → preview eligible students + proposed
 * next class/section → adjust per student → approve. History preserved;
 * duplicate promotion prevented; final classes graduate safely.
 */
export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { academicYears } = await listAcademicYears(db, ctx);
  const { classes } = await listClasses(db, ctx);

  const fromYearId = sp["fromYearId"] !== undefined && UUID_RE.test(sp["fromYearId"]) ? sp["fromYearId"] : "";
  const toYearId = sp["toYearId"] !== undefined && UUID_RE.test(sp["toYearId"]) ? sp["toYearId"] : "";
  const classId = sp["classId"] !== undefined && UUID_RE.test(sp["classId"]) ? sp["classId"] : "";

  let preview: Awaited<ReturnType<typeof previewPromotion>> | null = null;
  let previewError: string | undefined;
  if (fromYearId !== "" && toYearId !== "") {
    try {
      preview = await previewPromotion(db, ctx, {
        fromYearId,
        toYearId,
        classId: classId === "" ? null : classId,
      });
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  // Section options per class (for the per-student next-section selects).
  const sectionOptionsByClass = new Map<string, { value: string; label: string }[]>();
  for (const c of classes) {
    const { sections } = await listSections(db, ctx, c.id);
    sectionOptionsByClass.set(
      c.id,
      sections.map((s) => ({ value: s.id, label: `${c.name} ${s.name}` })),
    );
  }

  return (
    <div>
      <h1 className="page-title">Academic promotions</h1>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.school.name} · History is preserved; promotion is an explicit admin
        action (never automatic). Final classes graduate safely.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="ui-label">From year</span>
          <select name="fromYearId" defaultValue={fromYearId} className="ui-input">
            <option value="">Select…</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="ui-label">To year</span>
          <select name="toYearId" defaultValue={toYearId} className="ui-input">
            <option value="">Select…</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="ui-label">Class (optional)</span>
          <select name="classId" defaultValue={classId} className="ui-input">
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-btn ui-btn-secondary">
          Preview
        </button>
      </form>

      {previewError !== undefined && (
        <p role="alert" className="ui-alert ui-alert-error mt-4">
          {previewError}
        </p>
      )}

      {preview !== null && (
        <>
          <h3 className="mb-2 mt-6 font-semibold">
            Proposals ({preview.proposals.length} students)
          </h3>
          {preview.proposals.length === 0 ? (
            <EmptyState message="No eligible students found for this year/class." />
          ) : (
            <form
              action={promoteStudentsFormAction.bind(null, {})}
              className="space-y-2 text-sm"
            >
              <input type="hidden" name="fromYearId" value={fromYearId} />
              <input type="hidden" name="toYearId" value={toYearId} />
              {preview.proposals.map((p, i) => {
                const classOptions =
                  p.nextClassId === null
                    ? []
                    : (sectionOptionsByClass.get(p.nextClassId) ?? []);
                return (
                  <div key={p.studentId} className="ui-panel">
                    <input type="hidden" name={`studentId_${i}`} value={p.studentId} />
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium">{p.displayName}</span>
                      <span className="text-gray-600">
                        {p.admissionNo} · {p.currentClassName}
                        {p.action === "GRADUATE"
                          ? " · FINAL CLASS → graduate"
                          : p.action === "ALREADY_PROMOTED"
                            ? " · already promoted"
                            : ""}
                      </span>
                      {p.nextClassName !== null && (
                        <span className="text-xs text-gray-500">
                          proposed: {p.nextClassName}
                        </span>
                      )}
                    </div>
                    {p.action !== "GRADUATE" && (
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <label className="text-xs">
                          <span className="ui-label">Next section</span>
                          <select
                            name={`nextSectionId_${i}`}
                            defaultValue={p.nextSectionId ?? ""}
                            className="rounded border px-2 py-1"
                          >
                            <option value="">None</option>
                            {classOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" name={`hold_${i}`} className="h-4 w-4" />
                          <span className="text-gray-600">Hold / retain (no promotion)</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="submit"
                className="ui-btn ui-btn-primary"
              >
                Approve promotion
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
