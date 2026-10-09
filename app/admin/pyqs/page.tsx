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
    <main>
      <PageHeader title="Previous year questions" />

      <form method="get" className="mb-4 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="includeInactive" defaultChecked={sp["includeInactive"] === "true"} className="h-4 w-4" />
          <span className="text-gray-600">Include archived</span>
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Filter
        </button>
      </form>

      {pyqs.length === 0 ? (
        <EmptyState message="No PYQs uploaded yet." />
      ) : (
        <ul className="space-y-3 text-sm">
          {pyqs.map((p) => (
            <li key={p.id} className="rounded border p-3">
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

      <h3 className="mb-2 mt-8 font-semibold">Upload PYQ</h3>
      <form action={createPyqAction.bind(null, {})} className="max-w-lg space-y-4">
        <div>
          <label htmlFor="pyq-classId" className="mb-1 block text-sm font-medium">
            Class *
          </label>
          <select id="pyq-classId" name="classId" required className="w-full rounded border px-3 py-2">
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pyq-subjectId" className="mb-1 block text-sm font-medium">
            Subject *
          </label>
          <select id="pyq-subjectId" name="subjectId" required className="w-full rounded border px-3 py-2">
            <option value="">Select…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pyq-yearLabel" className="mb-1 block text-sm font-medium">
            Year *
          </label>
          <input id="pyq-yearLabel" name="yearLabel" required className="w-full rounded border px-3 py-2" placeholder="2025" />
        </div>
        <div>
          <label htmlFor="pyq-examBoardName" className="mb-1 block text-sm font-medium">
            Exam/Board name *
          </label>
          <input id="pyq-examBoardName" name="examBoardName" required className="w-full rounded border px-3 py-2" placeholder="CBSE Board 2024" />
        </div>
        <div>
          <label htmlFor="pyq-title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input id="pyq-title" name="title" className="w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label htmlFor="pyq-file" className="mb-1 block text-sm font-medium">
            Question paper * (PDF/images/Office, ≤10 MB)
          </label>
          <input id="pyq-file" name="file" type="file" required className="w-full" />
        </div>
        <div>
          <label htmlFor="pyq-solution" className="mb-1 block text-sm font-medium">
            Solution (optional)
          </label>
          <input id="pyq-solution" name="solution" type="file" className="w-full" />
        </div>
        <div>
          <label htmlFor="pyq-answerKey" className="mb-1 block text-sm font-medium">
            Answer key (optional)
          </label>
          <input id="pyq-answerKey" name="answerKey" type="file" className="w-full" />
        </div>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          Upload PYQ
        </button>
      </form>
      <p className="mt-2 text-xs text-gray-500">
        Files are stored privately; students download via expiring signed links.
      </p>
    </main>
  );
}
