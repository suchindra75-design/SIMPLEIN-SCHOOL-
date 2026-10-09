import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import {
  addAssignmentAction,
  removeAssignmentAction,
  updateTeacherAction,
} from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { listClasses } from "@/lib/services/classes";
import { listSubjects } from "@/lib/services/subjects";
import {
  getTeacher,
  listTeacherAssignments,
} from "@/lib/services/teachers";
import type { TeacherDto } from "@/lib/services/dto";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let teacher: TeacherDto;
  try {
    teacher = await getTeacher(db, ctx, id);
  } catch {
    notFound();
  }
  const [{ assignments }, { classes }, { subjects }] = await Promise.all([
    listTeacherAssignments(db, ctx, id),
    listClasses(db, ctx),
    listSubjects(db, ctx),
  ]);
  const sectionOptions = classes.flatMap((c) =>
    (c.sections ?? []).map((s) => ({ value: s.id, label: `${c.name} ${s.name}` })),
  );

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Edit teacher</h2>
      <SmartForm
        action={updateTeacherAction.bind(null, id)}
        redirectTo="/admin/teachers"
        submitLabel="Save changes"
        fields={[
          { name: "employeeNo", label: "Employee number", required: true, defaultValue: teacher.employeeNo },
          { name: "firstName", label: "First name", required: true, defaultValue: teacher.firstName },
          { name: "lastName", label: "Last name", defaultValue: teacher.lastName },
          { name: "phone", label: "Phone", type: "tel", defaultValue: teacher.phone ?? "" },
          { name: "email", label: "Email", type: "email", defaultValue: teacher.email ?? "" },
          { name: "qualification", label: "Qualification", defaultValue: teacher.qualification ?? "" },
          { name: "dateOfJoining", label: "Joining date", type: "date", defaultValue: teacher.dateOfJoining ?? "" },
          { name: "isActive", label: "Active", type: "checkbox", checked: teacher.isActive },
        ]}
      />
      <h3 className="mb-2 mt-8 font-semibold">Subject assignments</h3>
      {assignments.length === 0 ? (
        <p className="text-sm text-gray-500">No assignments yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <span>
                {a.subjects.name} — {a.sections.name}
              </span>
              <ConfirmButton
                label="Remove"
                confirmMessage="Remove this assignment?"
                run={removeAssignmentAction.bind(null, id, a.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <h4 className="mb-2 mt-4 font-medium">Add assignment</h4>
      <SmartForm
        action={addAssignmentAction.bind(null, id)}
        submitLabel="Assign"
        fields={[
          {
            name: "subjectId",
            label: "Subject",
            type: "select",
            required: true,
            options: subjects.map((s) => ({
              value: s.id,
              label: s.name,
            })),
          },
          {
            name: "sectionId",
            label: "Section",
            type: "select",
            required: true,
            options: sectionOptions,
          },
        ]}
      />
    </main>
  );
}
