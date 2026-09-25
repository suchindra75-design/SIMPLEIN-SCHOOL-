import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listChildExamSchedule } from "@/lib/services/exams";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Parent view: child selector + exam schedule (linked children only). */
export default async function ParentExamsPage({
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

  let exams: Awaited<ReturnType<typeof listChildExamSchedule>>["exams"] = [];
  let loadError: string | undefined;
  if (selectedId !== "") {
    try {
      ({ exams } = await listChildExamSchedule(db, ctx, selectedId));
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Exam schedule</h2>
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
          <form method="get" className="mt-4">
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
            <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
              View
            </button>
          </form>

          {loadError !== undefined && (
            <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {selected !== undefined && (
            <p className="mt-4 text-sm text-gray-600">
              {selected.displayName} · {selected.classes?.name ?? ""}
              {selected.sections?.name ? ` ${selected.sections.name}` : ""}
            </p>
          )}

          {exams.length === 0 ? (
            <div className="mt-4">
              <EmptyState message="No exams scheduled for this child's class yet." />
            </div>
          ) : (
            <ul className="mt-4 space-y-4 text-sm">
              {exams.map((e) => (
                <li key={e.id} className="rounded border p-4">
                  <p className="font-semibold">
                    {e.name}{" "}
                    <span className="font-normal text-gray-600">
                      · {e.startsOn} → {e.endsOn}
                    </span>
                  </p>
                  {(e.subjects ?? []).length === 0 ? (
                    <p className="mt-2 text-gray-500">No subjects scheduled.</p>
                  ) : (
                    <table className="mt-2 w-full">
                      <thead>
                        <tr className="border-b text-left text-gray-600">
                          <th className="py-1">Subject</th>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Max</th>
                          <th>Passing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(e.subjects ?? []).map((s) => (
                          <tr key={s.id} className="border-b">
                            <td className="py-1">{s.subjects?.name ?? "—"}</td>
                            <td>{s.examDate ?? "—"}</td>
                            <td>
                              {s.startTime === null
                                ? "—"
                                : `${s.startTime}${s.endTime ? `–${s.endTime}` : ""}`}
                            </td>
                            <td>{s.maxMarks}</td>
                            <td>{s.passingMarks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
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
