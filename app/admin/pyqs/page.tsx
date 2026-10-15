import { requireRole } from "@/lib/auth/session";
import {
  archivePyqAction,
  createPyqAction,
  restorePyqAction,
  updatePyqAction,
} from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { listClasses } from "@/lib/services/classes";
import { listSubjects } from "@/lib/services/subjects";
import { listPyqs } from "@/lib/services/pyqs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminPyqsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ classes }, { subjects }] = await Promise.all([
    listClasses(db, ctx),
    listSubjects(db, ctx),
  ]);
  const { pyqs } = await listPyqs(db, ctx, {
    includeInactive: sp["includeInactive"] === "true",
    page: 1,
    limit: 100,
  });

  return (
    <div>
      <PageHeader title="Previous year questions" />

      <form method="get" className="mb-4 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="includeInactive" defaultChecked={sp["includeInactive"] === "true"} className="h-4 w-4" />
          <span className="text-gray-600">Include archived</span>
        </label>
        <button type="submit" className="ui-btn ui-btn-secondary">
          Filter
        </button>
      </form>

      {pyqs.length === 0 ? (
        <EmptyState message="No PYQs uploaded yet." />
      ) : (
        <ul className="space-y-3 text-sm">
          {pyqs.map((p) => (
            <li key={p.id} className="ui-panel">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">
                  {p.title ?? `${p.classes?.name ?? ""} ${p.subjects?.name ?? ""}`}
                </span>
                <StatusBadge active={p.isActive} />
                <span className="text-gray-600">
                  {p.classes?.name ?? ""} · {p.subjects?.name ?? ""} · {p.yearLabel} ·{" "}
                  {p.examBoardName}
                </span>
                <span className="ml-auto">
                  <form action={(p.isActive ? archivePyqAction : restorePyqAction).bind(null, p.id)}>
                    <button type="submit" className="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                      {p.isActive ? "Archive" : "Restore"}
                    </button>
                  </form>
                </span>
              </div>
              <div className="mt-2">
                <SmartForm
                  action={updatePyqAction.bind(null, p.id)}
                  submitLabel="Update metadata"
                  fields={[
                    { name: "yearLabel", label: "Year", required: true, defaultValue: p.yearLabel },
                    { name: "examBoardName", label: "Exam/Board name", required: true, defaultValue: p.examBoardName },
                    { name: "title", label: "Title", defaultValue: p.title ?? "" },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="section-title mb-3 mt-8">Upload a past paper</h3>
      <SmartForm
        action={createPyqAction}
        submitLabel="Upload past paper"
        fields={[
          { name: "classId", label: "Class", type: "select", required: true, options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { name: "subjectId", label: "Subject", type: "select", required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
          { name: "yearLabel", label: "Year", required: true, placeholder: "2025" },
          { name: "examBoardName", label: "Exam / board name", required: true, placeholder: "CBSE Board 2024" },
          { name: "title", label: "Title" },
          { name: "file", label: "Question paper (PDF/images/Office, ≤4 MB)", type: "file", required: true },
          { name: "solution", label: "Solution (optional)", type: "file" },
          { name: "answerKey", label: "Answer key (optional)", type: "file" },
        ]}
      />
      <p className="mt-2 text-xs text-gray-500">
        Files are stored privately; students download via expiring signed links.
      </p>
    </div>
  );
}
