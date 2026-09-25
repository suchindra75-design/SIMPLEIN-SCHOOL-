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
    <main>
      <PageHeader title="Teachers" actionHref="/admin/teachers/new" actionLabel="Add teacher" />
      <SearchBar
        fields={[
          { name: "search", label: "Name / employee no" },
          {
            name: "isActive",
            label: "Active",
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
        <EmptyState message="No teachers found." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2">Name</th>
              <th>Employee no</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="py-2">
                  <Link href={`/admin/teachers/${t.id}`} className="underline">
                    {t.displayName}
                  </Link>
                </td>
                <td>{t.employeeNo}</td>
                <td>{t.phone ?? "—"}</td>
                <td>
                  <StatusBadge active={t.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination
        page={Number(sp["page"] ?? 1)}
        limit={20}
        total={total}
        baseParams={{ search: sp["search"], isActive: sp["isActive"] }}
      />
    </main>
  );
}
