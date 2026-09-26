import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listHomework } from "@/lib/services/homework";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parent view: child selector + homework for that child's sections (read-only). */
export default async function ParentHomeworkPage({
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
  const requestedSection =
    sp["sectionId"] !== undefined && UUID_RE.test(sp["sectionId"])
      ? sp["sectionId"]
      : undefined;
  const sectionId =
    selected?.sectionId !== null && selected?.sectionId !== undefined
      ? (requestedSection ?? selected.sectionId)
      : (requestedSection ?? "");

  const { homework } =
    sectionId === ""
      ? { homework: [] }
      : await listHomework(db, ctx, { sectionId, page: 1, limit: 50 });

  return (
    <main>
      <h2 className="text-xl font-semibold">Homework</h2>
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

          {homework.length === 0 ? (
            <div className="mt-4">
              <EmptyState message="No homework for this child's section yet." />
            </div>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {homework.map((h) => (
                <li key={h.id} className="rounded border p-3">
                  <p className="font-medium">
                    {h.title}{" "}
                    <span className="font-normal text-gray-600">
                      · {h.subjects?.name ?? "—"} · {h.teachers?.displayName ?? "—"} · due{" "}
                      {h.dueDate}
                    </span>
                  </p>
                  <p className="mt-1 text-gray-700">{h.description}</p>
                  {h.attachments !== undefined && h.attachments.length > 0 && (
                    <p className="mt-1 text-xs text-gray-600">
                      Attachments:{" "}
                      {h.attachments.map((a, i) => (
                        <span key={a.id}>
                          {i > 0 && " · "}
                          <AttachmentLink
                            homeworkId={h.id}
                            attachmentId={a.id}
                            label={a.originalName}
                          />
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
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
