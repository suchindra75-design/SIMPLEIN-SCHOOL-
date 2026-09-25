import { requireRole } from "@/lib/auth/session";
import { createTeacherAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";

export const dynamic = "force-dynamic";

export default async function NewTeacherPage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Add teacher</h2>
      <SmartForm
        action={createTeacherAction}
        redirectTo="/admin/teachers"
        submitLabel="Create teacher"
        fields={[
          { name: "employeeNo", label: "Employee number", required: true },
          { name: "firstName", label: "First name", required: true },
          { name: "lastName", label: "Last name" },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "email", label: "Email", type: "email" },
          { name: "qualification", label: "Qualification" },
          { name: "dateOfJoining", label: "Joining date", type: "date" },
        ]}
      />
      <p className="mt-4 text-sm text-gray-600">
        To give this teacher a login, create a user under Users and link this profile.
      </p>
    </main>
  );
}
