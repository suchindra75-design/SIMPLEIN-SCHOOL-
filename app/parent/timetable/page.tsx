import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { WeeklyTimetable } from "@/app/components/WeeklyTimetable";
import { listMyTimetable, listSectionTimetable } from "@/lib/services/timetable";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parent view: child selector + that child's timetable (linked children only). */
export default async function ParentTimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const scope = await getParentScope(db, ctx);
  const { children } =
    scope === null ? { children: [] } : await listChildren(db, ctx, scope.parentId);

  const requested = sp["studentId"];
  // Scope guard: only linked children are ever viewable (server-enforced).
  const selectedId =
    requested !== undefined && children.some((c) => c.id === requested)
      ? requested
      : (children[0]?.id ?? "");
  const selected = children.find((c) => c.id === selectedId);

  // The child's own section timetable (section from the child record; the
  // service re-checks that the section holds a linked child).
  let slots: Awaited<ReturnType<typeof listSectionTimetable>>["slots"] = [];
  let mySlots: Awaited<ReturnType<typeof listMyTimetable>>["slots"] = [];
  if (scope !== null && children.length > 0) {
    ({ slots: mySlots } = await listMyTimetable(db, ctx));
    const sectionId =
      sp["sectionId"] !== undefined &&
      UUID_RE.test(sp["sectionId"]) &&
      mySlots.some((s) => s.sectionId === sp["sectionId"])
        ? sp["sectionId"]
        : (selected?.sectionId ?? (mySlots[0]?.sectionId ?? ""));
    if (sectionId !== "") {
      try {
        ({ slots } = await listSectionTimetable(db, ctx, sectionId));
      } catch {
        slots = [];
      }
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Timetable</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name}
      </p>

      {scope === null ? (
        <p className="mt-4 text-sm text-gray-600">
          No parent profile is linked to your login yet.
        </p>
      ) : children.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No children are linked to your account yet." />
        </div>
      ) : (
        <>
          <form method="get" className="mt-4">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Child</span>
              <select name="studentId" defaultValue={selectedId} className="rounded border px-2 py-1.5">
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.classes?.name ? ` · ${c.classes.name}` : ""}
                    {c.sections?.name ? ` ${c.sections.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
              View
            </button>
          </form>

          {selected !== undefined && (
            <p className="mt-4 text-sm text-gray-600">
              {selected.displayName} · {selected.classes?.name ?? ""}
              {selected.sections?.name ? ` ${selected.sections.name}` : ""}
            </p>
          )}
          <div className="mt-2">
            <WeeklyTimetable slots={slots} />
          </div>
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href="/parent" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
