import { requireRole } from "@/lib/auth/session";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listHomework } from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student homework: own section only (read-only). */
export default async function StudentHomeworkPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const { homework } = await listHomework(db, ctx, { page: 1, limit: 50 });

  return (
    <main>
      <h2 className="text-xl font-semibold">Homework</h2>
      <p className="mt-1 text-sm text-gray-600">{ctx.school.name} · Your section only</p>
      {homework.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No homework for your section yet." />
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
                      <AttachmentLink homeworkId={h.id} attachmentId={a.id} label={a.originalName} />
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
