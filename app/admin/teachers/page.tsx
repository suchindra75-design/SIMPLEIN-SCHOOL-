import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import type { TeacherDto } from "@/lib/services/dto";
import { listTeachers } from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  Pagination,
  SearchBar,
  StatusBadge,
} from "@/app/admin/_components/ui";
import { Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let teachers: TeacherDto[] = [];
  let total = 0;
  let loadError: string | undefined;
  try {
    ({ teachers, total } = await listTeachers(db, ctx, {
      search: sp["search"],
      isActive: sp["isActive"] === undefined ? undefined : sp["isActive"] === "true",
      page: Number(sp["page"] ?? 1),
      limit: 20,
    }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load";
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Faculty & Teachers"
        actionHref="/admin/teachers/new"
        actionLabel="Add Teacher"
      />

      <SearchBar
        fields={[
          { name: "search", label: "Name / Employee No" },
          {
            name: "isActive",
            label: "Status",
            options: [
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ],
          },
        ]}
        values={{ search: sp["search"], isActive: sp["isActive"] }}
      />

      <ErrorAlert error={loadError} />

      {teachers.length === 0 ? (
        <EmptyState message="No faculty records found. Click 'Add Teacher' to create the first record." />
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold font-mono">
                  <th className="py-3 px-4">Instructor Name</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-zinc-950">
                      <Link href={`/admin/teachers/${t.id}`} className="hover:underline">
                        {t.displayName}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-600">{t.employeeNo}</td>
                    <td className="py-3 px-4 font-mono text-zinc-600">{t.phone ?? "—"}</td>
                    <td className="py-3 px-4">
                      <StatusBadge active={t.isActive} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/teachers/${t.id}`}
                        className="inline-flex items-center gap-1 text-zinc-700 hover:text-zinc-950 font-mono text-[11px] underline"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Profile</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={Number(sp["page"] ?? 1)}
        limit={20}
        total={total}
        baseParams={{ search: sp["search"], isActive: sp["isActive"] }}
      />
    </div>
  );
}
