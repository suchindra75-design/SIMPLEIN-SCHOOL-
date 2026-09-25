import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { setExamActiveAction } from "@/app/admin/actions";
import { ConfirmButton } from "@/app/admin/_components/forms";
import { listExams } from "@/lib/services/exams";
import { listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";

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
    <main>
      <PageHeader title="Exams" actionHref="/admin/exams/new" actionLabel="New exam" />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
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
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Filter
        </button>
        <Link href="/admin/exams" className="rounded border px-3 py-1.5 text-sm text-gray-600">
          Clear
        </Link>
      </form>

      {exams.length === 0 ? (
        <EmptyState message="No exams yet. Create Unit Test 1, First Term Examination, … — names are fully configurable." />
      ) : (
        <ul className="space-y-2 text-sm">
          {exams.map((e) => (
            <li key={e.id} className="rounded border p-3">
              <div className="flex items-center gap-3">
                <Link href={`/admin/exams/${e.id}`} className="font-medium underline">
                  {e.name}
                </Link>
                <StatusBadge active={e.isActive} />
                <span className="text-gray-600">
                  {e.classes?.name ?? ""} · {e.startsOn} → {e.endsOn}
                </span>
                <span className="ml-auto">
                  <ConfirmButton
                    label={e.isActive ? "Deactivate" : "Activate"}
                    confirmMessage={`${e.isActive ? "Deactivate" : "Activate"} ${e.name}?`}
                    run={setExamActiveAction.bind(null, e.id, !e.isActive)}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
