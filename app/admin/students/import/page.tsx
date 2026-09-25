import { requireRole } from "@/lib/auth/session";
import { ImportClient } from "@/app/admin/students/import/ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <main>
      <h2 className="mb-2 text-xl font-semibold">Import students</h2>
      <p className="mb-4 text-sm text-gray-600">
        Columns: Name | Admission Number | DOB (YYYY-MM-DD) | Gender | Class |
        Section | Roll Number | Parent Name | Parent Phone. Headers are matched
        flexibly (full format in <code>docs/STUDENT_IMPORT.md</code>). Nothing
        is created until you confirm the preview.
      </p>
      <ImportClient />
    </main>
  );
}
