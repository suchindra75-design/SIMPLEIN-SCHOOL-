import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { setExamActiveAction } from "@/app/admin/actions";
import { ConfirmButton } from "@/app/admin/_components/forms";
import { listExams } from "@/lib/services/exams";
import { listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";
import { FileSpreadsheet, Calendar, Search } from "lucide-react";
import { formatFriendlyDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { exams } = await listExams(db, ctx, {
    academicYearId: sp["yearId"],
    classId: sp["classId"],
    page: 1,
    limit: 100,
  });
  const { classes } = await listClasses(db, ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations & Assessments"
        actionHref="/admin/exams/new"
        actionLabel="Schedule Exam"
      />

      <form method="get" className="flex flex-wrap items-end gap-3 p-4 bg-white rounded-lg border border-zinc-200 shadow-2xs">
        <label className="text-xs">
          <span className="mb-1 block font-semibold text-zinc-700">Filter by Class</span>
          <select
            name="classId"
            defaultValue={sp["classId"] ?? ""}
            className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 focus:outline-hidden focus:border-zinc-950 focus:bg-white"
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Filter</span>
        </button>
        <Link
          href="/admin/exams"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium transition-colors"
        >
          Clear
        </Link>
      </form>

      {exams.length === 0 ? (
        <EmptyState message="No exam cycles scheduled yet. Click 'Schedule Exam' to define a new cycle." />
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold font-mono">
                  <th className="py-3 px-4">Exam Cycle Name</th>
                  <th className="py-3 px-4">Class Target</th>
                  <th className="py-3 px-4">Assessment Schedule</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {exams.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-zinc-950">
                      <Link href={`/admin/exams/${e.id}`} className="hover:underline flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-zinc-700" />
                        <span>{e.name}</span>
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-700">
                      {e.classes?.name ?? "School-Wide"}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-600">
                      {formatFriendlyDate(e.startsOn)} → {formatFriendlyDate(e.endsOn)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge active={e.isActive} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <Link
                          href={`/admin/exams/${e.id}`}
                          className="text-zinc-700 hover:text-zinc-950 font-mono text-[11px] underline"
                        >
                          Subjects & Marks
                        </Link>
                        <ConfirmButton
                          label={e.isActive ? "Deactivate" : "Activate"}
                          confirmMessage={`${e.isActive ? "Deactivate" : "Activate"} ${e.name}?`}
                          run={setExamActiveAction.bind(null, e.id, !e.isActive)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
