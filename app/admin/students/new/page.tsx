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
      <h2 className="mb-4 text-xl font-semibold">Add student & parent</h2>
      <p className="mb-6 text-sm text-gray-600">
        Consolidated enrollment: enter student details and linked parent/guardian information in one workflow.
      </p>
      <SmartForm
        action={createStudentAction}
        redirectTo="/admin/students"
        submitLabel="Create student & parent link"
        fields={[
          { name: "admissionNo", label: "Admission number *", required: true, placeholder: "e.g. S-2026-001" },
          { name: "firstName", label: "First name *", required: true },
          { name: "middleName", label: "Middle name" },
          { name: "lastName", label: "Last name *" },
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
          { name: "admissionDate", label: "Admission date", type: "date" },
          { name: "address", label: "Address", type: "textarea" },
          { name: "parentName", label: "Parent / Guardian Name", placeholder: "Full Name" },
          { name: "parentPhone", label: "Parent Mobile Number (Login Identifier)", type: "tel", placeholder: "10-digit mobile" },
          { name: "parentEmail", label: "Parent Email (Optional)", type: "email" },
          {
            name: "parentRelation",
            label: "Parent Relationship",
            type: "select",
            options: [
              { value: "father", label: "Father" },
              { value: "mother", label: "Mother" },
              { value: "guardian", label: "Guardian" },
              { value: "other", label: "Other" },
            ],
          },
        ]}
      />
    </main>
  );
}
