import { requireRole } from "@/lib/auth/session";
import { createSubjectAction, setSubjectActiveAction } from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";
import { listSubjects } from "@/lib/services/subjects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { subjects } = await listSubjects(db, ctx);
  const typed = subjects;

  return (
    <main>
      <PageHeader title="Subjects" />
      {typed.length === 0 ? (
        <EmptyState message="No subjects yet. Add Mathematics, English, … — names and codes are fully configurable." />
      ) : (
        <ul className="space-y-2 text-sm">
          {typed.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded border p-3">
              <span className="font-medium">{s.name}</span>
              {s.code !== null && s.code !== undefined && (
                <span className="text-gray-600">({s.code})</span>
              )}
              <StatusBadge active={s.isActive} />
              <span className="ml-auto">
                <ConfirmButton
                  label={s.isActive ? "Deactivate" : "Activate"}
                  confirmMessage={`${s.isActive ? "Deactivate" : "Activate"} ${s.name}?`}
                  run={setSubjectActiveAction.bind(null, s.id, !s.isActive)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 mt-8 font-semibold">New subject</h3>
      <SmartForm
        action={createSubjectAction}
        submitLabel="Create subject"
        fields={[
          { name: "name", label: "Subject name", required: true, placeholder: "Mathematics" },
          { name: "code", label: "Code", placeholder: "MATH" },
          { name: "orderIndex", label: "Display order", type: "number", defaultValue: "0" },
        ]}
      />
      <p className="mt-4 text-sm text-gray-600">
        Link subjects to classes from the class page.
      </p>
    </main>
  );
}
