import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClassAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";
import { listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { classes } = await listClasses(db, ctx);
  const typed = classes;

  return (
    <main>
      <PageHeader title="Classes & sections" />
      {typed.length === 0 ? (
        <EmptyState message="No classes yet. Create Class 1 … Class 10, or Nursery/LKG/UKG — names are fully configurable." />
      ) : (
        <ul className="space-y-2 text-sm">
          {typed.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded border p-3">
              <Link href={`/admin/classes/${c.id}`} className="font-medium underline">
                {c.name}
              </Link>
              <StatusBadge active={c.isActive} />
              <span className="text-gray-600">
                {(c.sections ?? []).map((s) => s.name).join(", ") || "no sections"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 mt-8 font-semibold">New class</h3>
      <SmartForm
        action={createClassAction}
        submitLabel="Create class"
        fields={[
          { name: "name", label: "Class name", required: true, placeholder: "Grade 7" },
          { name: "orderIndex", label: "Display order", type: "number", defaultValue: "0" },
        ]}
      />
    </main>
  );
}
