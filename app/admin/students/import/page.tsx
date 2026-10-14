import { requireRole } from "@/lib/auth/session";
import { ImportClient } from "@/app/admin/students/import/ImportClient";
import { PageHeader } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <div>
      <PageHeader
        title="Import students"
        description={
          <>
            Columns: Name | Admission Number | DOB (YYYY-MM-DD) | Gender | Class |
            Section | Roll Number | Parent Name | Parent Phone. Headers are matched
            flexibly (full format in <code>docs/STUDENT_IMPORT.md</code>). Nothing
            is created until you confirm the preview.
          </>
        }
      />
      <ImportClient />
    </div>
  );
}
