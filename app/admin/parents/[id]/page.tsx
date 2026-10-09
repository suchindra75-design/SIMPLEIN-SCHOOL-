import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import {
  linkChildAction,
  unlinkChildAction,
  updateParentAction,
} from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { getParent, listChildren } from "@/lib/services/parents";
import { listStudents } from "@/lib/services/students";
import type { ParentDto } from "@/lib/services/dto";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ParentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let parent: ParentDto;
  try {
    parent = await getParent(db, ctx, id);
  } catch {
    notFound();
  }
  const [{ children }, { students }] = await Promise.all([
    listChildren(db, ctx, id),
    listStudents(db, ctx, {
      status: "active",
      page: 1,
      limit: 100,
    }),
  ]);

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Edit parent</h2>
      <SmartForm
        action={updateParentAction.bind(null, id)}
        redirectTo="/admin/parents"
        submitLabel="Save changes"
        fields={[
          { name: "fullName", label: "Full name", required: true, defaultValue: parent.fullName },
          { name: "phone", label: "Phone", type: "tel", defaultValue: parent.phone ?? "" },
          { name: "email", label: "Email", type: "email", defaultValue: parent.email ?? "" },
          { name: "address", label: "Address", type: "textarea", defaultValue: parent.address ?? "" },
          { name: "isActive", label: "Active", type: "checkbox", checked: parent.isActive },
        ]}
      />
      <h3 className="mb-2 mt-8 font-semibold">Linked children</h3>
      {children.length === 0 ? (
        <p className="text-sm text-gray-500">No children linked yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {children.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <span>
                {c.displayName} ({c.link.relation})
              </span>
              <ConfirmButton
                label="Unlink"
                confirmMessage={`Unlink ${c.displayName} from this parent?`}
                run={unlinkChildAction.bind(null, id, c.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <h4 className="mb-2 mt-4 font-medium">Link a child</h4>
      <SmartForm
        action={linkChildAction.bind(null, id)}
        submitLabel="Link child"
        fields={[
          {
            name: "studentId",
            label: "Student",
            type: "select",
            required: true,
            options: students.map((s) => ({
              value: s.id,
              label: `${s.displayName} (${s.admissionNo})`,
            })),
          },
          {
            name: "relation",
            label: "Relationship",
            type: "select",
            required: true,
            options: ["father", "mother", "guardian", "other"].map((r) => ({
              value: r,
              label: r,
            })),
          },
          { name: "isPrimary", label: "Primary guardian", type: "checkbox" },
        ]}
      />
    </main>
  );
}
