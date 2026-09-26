import { requireRole } from "@/lib/auth/session";
import { createUserAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { listParents } from "@/lib/services/parents";
import { listStudents } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ teachers }, { parents }, { students }] = await Promise.all([
    listTeachers(db, ctx, { page: 1, limit: 200 }),
    listParents(db, ctx, { page: 1, limit: 200 }),
    listStudents(db, ctx, { page: 1, limit: 200 }),
  ]);

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">New login</h2>
      <p className="mb-4 text-sm text-gray-600">
        Creates a Supabase Auth identity plus school profile and role. Only
        TEACHER, PARENT, or STUDENT can be granted here — SCHOOL_ADMIN is
        onboarding-only. STUDENT logins are self-only (read-only portal).
      </p>
      <SmartForm
        action={createUserAction}
        redirectTo="/admin/users"
        submitLabel="Create login"
        fields={[
          { name: "email", label: "Email", type: "email", required: true },
          { name: "fullName", label: "Full name", required: true },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "password", label: "Temporary password (min 10 chars)", type: "password", required: true },
          {
            name: "role",
            label: "Role",
            type: "select",
            required: true,
            options: [
              { value: "TEACHER", label: "Teacher" },
              { value: "PARENT", label: "Parent" },
              { value: "STUDENT", label: "Student (self-only portal)" },
            ],
          },
          {
            name: "teacherId",
            label: "Link teacher profile (for TEACHER role)",
            type: "select",
            options: teachers.map((t) => ({
              value: t.id,
              label: t.displayName,
            })),
          },
          {
            name: "parentId",
            label: "Link parent profile (for PARENT role)",
            type: "select",
            options: parents.map((p) => ({
              value: p.id,
              label: p.fullName,
            })),
          },
          {
            name: "studentId",
            label: "Link student profile (for STUDENT role)",
            type: "select",
            options: students.map((s) => ({
              value: s.id,
              label: `${s.displayName} (${s.admissionNo})`,
            })),
          },
        ]}
      />
    </main>
  );
}
