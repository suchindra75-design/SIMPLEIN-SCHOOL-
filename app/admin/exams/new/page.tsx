import { requireRole } from "@/lib/auth/session";
import { createExamAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { listClasses } from "@/lib/services/classes";
import { listAcademicYears } from "@/lib/services/years";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewExamPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ classes }, { academicYears }] = await Promise.all([
    listClasses(db, ctx),
    listAcademicYears(db, ctx),
  ]);

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">New exam</h2>
      <SmartForm
        action={createExamAction}
        redirectTo="/admin/exams"
        submitLabel="Create exam"
        fields={[
          { name: "name", label: "Exam name", required: true, placeholder: "Unit Test 1" },
          {
            name: "academicYearId",
            label: "Academic year",
            type: "select",
            required: true,
            options: academicYears.map((y) => ({ value: y.id, label: y.name })),
          },
          {
            name: "classId",
            label: "Class",
            type: "select",
            required: true,
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
          { name: "startsOn", label: "Exam window start", type: "date", required: true },
          { name: "endsOn", label: "Exam window end", type: "date", required: true },
        ]}
      />
      <p className="mt-4 text-sm text-gray-600">
        Subjects (marks + schedule) are added on the exam detail page after creation.
      </p>
    </main>
  );
}
