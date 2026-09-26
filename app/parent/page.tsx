import { requireRole } from "@/lib/auth/session";
import { UnreadBadge } from "@/app/components/UnreadBadge";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const scope = await getParentScope(db, ctx);
  const { children } =
    scope === null ? { children: [] } : await listChildren(db, ctx, scope.parentId);

  return (
    <main>
      <h2 className="text-xl font-semibold">My children</h2>
      <div className="mt-2"><UnreadBadge /></div>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name}
      </p>
      {scope === null ? (
        <p className="mt-4 text-sm text-gray-600">
          No parent profile is linked to your login yet. Contact your school
          administrator.
        </p>
      ) : children.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">No children linked yet.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {children.map((c) => (
            <li key={c.id} className="rounded border p-3">
              <span className="font-medium">{c.displayName}</span>
              <span className="text-gray-600">
                {" "}
                · {c.classes?.name ?? ""} {c.sections?.name ?? ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
