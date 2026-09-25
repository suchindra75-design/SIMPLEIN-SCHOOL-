import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import type { ParentDto } from "@/lib/services/dto";
import { listParents } from "@/lib/services/parents";
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

export default async function ParentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let parents: ParentDto[] = [];
  let total = 0;
  let loadError: string | undefined;
  try {
    ({ parents, total } = await listParents(db, ctx, {
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
      <PageHeader title="Parents" actionHref="/admin/parents/new" actionLabel="Add parent" />
      <SearchBar
        fields={[
          { name: "search", label: "Name / phone" },
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
      {parents.length === 0 ? (
        <EmptyState message="No parents found." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2">Name</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {parents.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2">
                  <Link href={`/admin/parents/${p.id}`} className="underline">
                    {p.fullName}
                  </Link>
                </td>
                <td>{p.phone ?? "—"}</td>
                <td>
                  <StatusBadge active={p.isActive} />
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
