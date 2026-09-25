import { requireRole } from "@/lib/auth/session";
import { createUserAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { listParents } from "@/lib/services/parents";
import { listTeachers } from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { teachers } = await listTeachers(db, ctx, { page: 1, limit: 200 });
  const { parents } = await listParents(db, ctx, { page: 1, limit: 200 });

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">New login</h2>
      <p className="mb-4 text-sm text-gray-600">
        Creates a Supabase Auth identity plus school profile and role. Only
        TEACHER or PARENT can be granted here — SCHOOL_ADMIN is onboarding-only.
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
        ]}
      />
    </main>
  );
}
