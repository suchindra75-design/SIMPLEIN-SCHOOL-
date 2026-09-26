import { requireRole } from "@/lib/auth/session";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listNotices } from "@/lib/services/notices";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student notices: audience-aware (own section/class + school-wide). */
export default async function StudentNoticesPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const { notices } = await listNotices(db, ctx, { page: 1, limit: 50 });

  return (
    <main>
      <h2 className="text-xl font-semibold">Notices</h2>
      <p className="mt-1 text-sm text-gray-600">{ctx.school.name} · Relevant to you</p>
      {notices.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No notices for you yet." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {notices.map((n) => (
            <li key={n.id} className="rounded border p-3">
              <p className="font-medium">
                {n.title}{" "}
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                  {n.category}
                </span>
              </p>
              <p className="mt-1 text-gray-700">{n.content}</p>
              {n.attachmentName !== null && (
                <p className="mt-1 text-xs text-gray-600">
                  Attachment:{" "}
                  <AttachmentLink
                    homeworkId={n.id}
                    attachmentId={n.id}
                    label={n.attachmentName}
                    kind="notice"
                  />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
