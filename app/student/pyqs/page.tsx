import { requireRole } from "@/lib/auth/session";
import { listPyqs } from "@/lib/services/pyqs";
import { listClasses } from "@/lib/services/classes";
import { listSubjects } from "@/lib/services/subjects";
import { PyqFileLink } from "@/app/components/PyqFileLink";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Student PYQs: browse the school's bank with filters (read-only). */
export default async function StudentPyqsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const { classes } = await listClasses(db, ctx);
  const { subjects } = await listSubjects(db, ctx);
  const { pyqs } = await listPyqs(db, ctx, {
    classId: sp["classId"] !== undefined && UUID_RE.test(sp["classId"]) ? sp["classId"] : undefined,
    subjectId: sp["subjectId"] !== undefined && UUID_RE.test(sp["subjectId"]) ? sp["subjectId"] : undefined,
    yearLabel: sp["yearLabel"],
    page: 1,
    limit: 50,
  });

  return (
    <main>
      <h2 className="text-xl font-semibold">Previous year questions</h2>
      <p className="mt-1 text-sm text-gray-600">{ctx.school.name} · School PYQ bank</p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Class</span>
          <select name="classId" defaultValue={sp["classId"] ?? ""} className="rounded border px-2 py-1.5">
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Subject</span>
          <select name="subjectId" defaultValue={sp["subjectId"] ?? ""} className="rounded border px-2 py-1.5">
            <option value="">All</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Year</span>
          <input name="yearLabel" defaultValue={sp["yearLabel"] ?? ""} className="rounded border px-2 py-1.5" placeholder="2025" />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Filter
        </button>
        <a href="/student/pyqs" className="rounded border px-3 py-1.5 text-sm text-gray-600">
          Clear
        </a>
      </form>

      {pyqs.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No PYQs found for these filters." />
        </div>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {pyqs.map((p) => (
            <li key={p.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">
                  {p.title ?? `${p.classes?.name ?? ""} ${p.subjects?.name ?? ""}`}
                </span>
                <span className="text-gray-600">
                  {p.classes?.name ?? ""} · {p.subjects?.name ?? ""} · {p.yearLabel} ·{" "}
                  {p.examBoardName}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                <PyqFileLink pyqId={p.id} label={`Question paper (${p.fileName})`} />{" "}
                {p.solutionName !== null && (
                  <>
                    ·{" "}
                    <PyqFileLink pyqId={p.id} kind="solution" label={`Solution (${p.solutionName})`} />
                  </>
                )}
                {p.answerKeyName !== null && (
                  <>
                    ·{" "}
                    <PyqFileLink pyqId={p.id} kind="answerKey" label={`Answer key (${p.answerKeyName})`} />
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
