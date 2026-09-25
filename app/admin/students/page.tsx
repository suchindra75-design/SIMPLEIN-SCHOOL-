import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listClasses } from "@/lib/services/classes";
import type { StudentDto } from "@/lib/services/dto";
import { listStudents } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { studentFiltersSchema } from "@/lib/validation/people";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  Pagination,
  SearchBar,
  StatusBadge,
} from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let students: StudentDto[] = [];
  let total = 0;
  let loadError: string | undefined;
  try {
    const filters = studentFiltersSchema.parse({
      search: sp["search"],
      classId: sp["classId"],
      sectionId: sp["sectionId"],
      status: sp["status"],
      page: sp["page"],
      limit: 20,
    });
    ({ students, total } = await listStudents(db, ctx, filters));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load";
  }
  const { classes } = await listClasses(db, ctx);
  const classOptions = classes.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const selectedClass = classes.find((c) => c.id === sp["classId"]);
  const sectionOptions = (selectedClass?.sections ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <main>
      <PageHeader
        title="Students"
        actionHref="/admin/students/new"
        actionLabel="Add student"
      />
      <Link href="/admin/students/import" className="mb-4 inline-block text-sm underline">
        Import from Excel/CSV
      </Link>
      <SearchBar
        fields={[
          { name: "search", label: "Name / admission no" },
          { name: "classId", label: "Class", options: classOptions },
          { name: "sectionId", label: "Section", options: sectionOptions },
          {
            name: "status",
            label: "Status",
            options: ["active", "inactive", "graduated", "transferred"].map(
              (s) => ({ value: s, label: s }),
            ),
          },
        ]}
        values={{
          search: sp["search"],
          classId: sp["classId"],
          sectionId: sp["sectionId"],
          status: sp["status"],
        }}
      />
      <ErrorAlert error={loadError} />
      {students.length === 0 ? (
        <EmptyState message="No students found. Add the first student or import from Excel." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2">Name</th>
              <th>Admission no</th>
              <th>Class</th>
              <th>Roll</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2">
                  <Link href={`/admin/students/${s.id}`} className="underline">
                    {s.displayName}
                  </Link>
                </td>
                <td>{s.admissionNo}</td>
                <td>
                  {s.classes?.name ?? "—"}
                  {s.sections?.name ? ` ${s.sections.name}` : ""}
                </td>
                <td>{s.rollNumber ?? "—"}</td>
                <td>
                  <StatusBadge active={s.status === "active"} />
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
        baseParams={{
          search: sp["search"],
          classId: sp["classId"],
          sectionId: sp["sectionId"],
          status: sp["status"],
        }}
      />
    </main>
  );
}
