import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import {
  updateStudentAction,
  uploadStudentPhotoAction,
} from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { listClasses } from "@/lib/services/classes";
import { getStudent } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let record: Awaited<ReturnType<typeof getStudent>>;
  try {
    record = await getStudent(db, ctx, id);
  } catch {
    notFound();
  }
  const s = record.student;
  const parents = record.parents;
  const { classes } = await listClasses(db, ctx);
  const typed = classes;

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Edit student</h2>
      <SmartForm
        action={updateStudentAction.bind(null, id)}
        redirectTo="/admin/students"
        submitLabel="Save changes"
        fields={[
          { name: "admissionNo", label: "Admission number", required: true, defaultValue: s.admissionNo },
          { name: "firstName", label: "First name", required: true, defaultValue: s.firstName },
          { name: "middleName", label: "Middle name", defaultValue: s.middleName ?? "" },
          { name: "lastName", label: "Last name", defaultValue: s.lastName },
          { name: "dob", label: "Date of birth", type: "date", defaultValue: s.dob ?? "" },
          {
            name: "gender",
            label: "Gender",
            type: "select",
            defaultValue: s.gender ?? "",
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
            defaultValue: s.classId ?? "",
            options: typed.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "sectionId",
            label: "Section",
            type: "select",
            defaultValue: s.sectionId ?? "",
            options: typed.flatMap((c) =>
              (c.sections ?? []).map((sec) => ({
                value: sec.id,
                label: `${c.name} ${sec.name}`,
              })),
            ),
          },
          { name: "rollNumber", label: "Roll number", defaultValue: s.rollNumber ?? "" },
          { name: "guardianPhone", label: "Guardian phone", type: "tel", defaultValue: s.guardianPhone ?? "" },
          { name: "admissionDate", label: "Admission date", type: "date", defaultValue: s.admissionDate ?? "" },
          { name: "address", label: "Address", type: "textarea", defaultValue: s.address ?? "" },
          {
            name: "status",
            label: "Status",
            type: "select",
            defaultValue: s.status,
            options: ["active", "inactive", "graduated", "transferred"].map((v) => ({
              value: v,
              label: v,
            })),
          },
        ]}
      />
      <h3 className="mb-2 mt-8 font-semibold">Photo</h3>
      <SmartForm
        action={uploadStudentPhotoAction.bind(null, id)}
        submitLabel="Upload photo (JPEG/PNG/WebP, ≤2 MB)"
        fields={[{ name: "photo", label: "Photo file", type: "file", required: true }]}
      />
      <h3 className="mb-2 mt-8 font-semibold">Linked parents</h3>
      {parents.length === 0 ? (
        <p className="text-sm text-gray-500">No parents linked yet.</p>
      ) : (
        <ul className="list-disc pl-6 text-sm">
          {parents.map((p) => (
            <li key={p.parentId}>
              <Link href={`/admin/parents/${p.parentId}`} className="underline">
                {p.parents.fullName}
              </Link>{" "}
              ({p.relation})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
