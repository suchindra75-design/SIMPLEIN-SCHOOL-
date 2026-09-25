import { requireRole } from "@/lib/auth/session";
import { createParentAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";

export const dynamic = "force-dynamic";

export default async function NewParentPage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Add parent</h2>
      <SmartForm
        action={createParentAction}
        redirectTo="/admin/parents"
        submitLabel="Create parent"
        fields={[
          { name: "fullName", label: "Full name", required: true },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "email", label: "Email", type: "email" },
          { name: "address", label: "Address", type: "textarea" },
        ]}
      />
      <p className="mt-4 text-sm text-gray-600">
        Link children on the parent detail page. To give this parent a login,
        create a user under Users and link this profile.
      </p>
    </main>
  );
}
