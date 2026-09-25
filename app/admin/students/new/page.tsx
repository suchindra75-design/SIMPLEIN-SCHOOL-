import { requireRole } from "@/lib/auth/session";
import { createStudentAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { classes } = await listClasses(db, ctx);
  const typed = classes;
  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Add student</h2>
      <SmartForm
        action={createStudentAction}
        redirectTo="/admin/students"
        submitLabel="Create student"
        fields={[
          { name: "admissionNo", label: "Admission number", required: true },
          { name: "firstName", label: "First name", required: true },
          { name: "middleName", label: "Middle name" },
          { name: "lastName", label: "Last name" },
          { name: "dob", label: "Date of birth", type: "date" },
          {
            name: "gender",
            label: "Gender",
            type: "select",
            options: [
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "other", label: "Other" },
            ],
          },
          {
            name: "classId",
            label: "Class",
            type: "select",
            options: typed.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "sectionId",
            label: "Section",
            type: "select",
            options: typed.flatMap((c) =>
              (c.sections ?? []).map((s) => ({
                value: s.id,
                label: `${c.name} ${s.name}`,
              })),
            ),
          },
          { name: "rollNumber", label: "Roll number" },
          { name: "guardianPhone", label: "Guardian phone", type: "tel" },
          { name: "admissionDate", label: "Admission date", type: "date" },
          { name: "address", label: "Address", type: "textarea" },
        ]}
      />
    </main>
  );
}
