import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import {
  getStudentAttendance,
  getStudentSummary,
} from "@/lib/services/attendance";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ParentAttendancePage({
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
  // Scope guard: only linked children are ever viewable (server-enforced;
  // unlinked/foreign ids are rejected by the service before data access).
  const selectedId =
    requested !== undefined && children.some((c) => c.id === requested)
      ? requested
      : (children[0]?.id ?? "");
  const selected = children.find((c) => c.id === selectedId);

  const from = DATE_RE.test(sp["from"] ?? "") ? sp["from"] : undefined;
  const to = DATE_RE.test(sp["to"] ?? "") ? sp["to"] : undefined;

  let summary: Awaited<ReturnType<typeof getStudentSummary>> | null = null;
  let history: Awaited<ReturnType<typeof getStudentAttendance>>["records"] = [];
  let loadError: string | undefined;
  if (selectedId !== "") {
    try {
      [summary, { records: history }] = await Promise.all([
        getStudentSummary(db, ctx, selectedId, { from, to }),
        getStudentAttendance(db, ctx, selectedId, {
          from,
          to,
          page: 1,
          limit: 50,
        }),
      ]);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Attendance</h2>
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
              <span className="mb-1 block text-gray-600">From</span>
              <input type="date" name="from" defaultValue={from ?? ""} className="rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">To</span>
              <input type="date" name="to" defaultValue={to ?? ""} className="rounded border px-2 py-1.5" />
            </label>
            <button type="submit" className="rounded border px-3 py-1.5 text-sm">
              Apply
            </button>
          </form>

          {loadError !== undefined && (
            <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {selected !== undefined && summary !== null && (
            <>
              <p className="mt-4 text-sm text-gray-600">
                {selected.displayName} · {selected.classes?.name ?? ""}
                {selected.sections?.name ? ` ${selected.sections.name}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <div className="rounded border p-3">
                  <p className="text-xs text-gray-600">Present</p>
                  <p className="text-xl font-bold">{summary.present}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-gray-600">Absent</p>
                  <p className="text-xl font-bold">{summary.absent}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-gray-600">Leave</p>
                  <p className="text-xl font-bold">{summary.leave}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-gray-600">Attendance</p>
                  <p className="text-xl font-bold">
                    {summary.percentage === null ? "—" : `${summary.percentage}%`}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Percentage = Present ÷ (Present + Absent). Approved Leave is
                excused and excluded from the calculation.
              </p>

              <h3 className="mb-2 mt-6 font-semibold">Daily history</h3>
              {history.length === 0 ? (
                <EmptyState message="No attendance recorded yet for this range." />
              ) : (
                <table className="w-full max-w-md text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-600">
                      <th className="py-2">Date</th>
                      <th>Status</th>
                      {history.some((r) => r.remark !== null) && <th>Remark</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.sessionId + r.date} className="border-b">
                        <td className="py-2">{r.date}</td>
                        <td>{r.status}</td>
                        {history.some((x) => x.remark !== null) && (
                          <td>{r.remark ?? "—"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Showing {history.length} of {history.length} days.{" "}
                <Link href="/parent" className="underline">
                  Back to dashboard
                </Link>
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
