import { requireRole } from "@/lib/auth/session";
import {
  getTeacherScope,
  listTeacherSections,
} from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const scope = await getTeacherScope(db, ctx);
  const { sections } =
    scope === null
      ? { sections: [] }
      : await listTeacherSections(db, ctx, scope.teacherId);

  return (
    <main>
      <h2 className="text-xl font-semibold">My classes</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name}
      </p>
      {scope === null ? (
        <p className="mt-4 text-sm text-gray-600">
          No teacher profile is linked to your login yet. Contact your school
          administrator.
        </p>
      ) : sections.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">
          No class or subject assignments yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {sections.map((s) => (
            <li key={s.id} className="rounded border p-3">
              {s.classes?.name ?? ""} {s.name}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
