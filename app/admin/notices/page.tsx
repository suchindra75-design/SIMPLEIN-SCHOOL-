import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import {
  createNoticeAction,
  deleteNoticeAction,
  restoreNoticeAction,
  setNoticePublishedAction,
  updateNoticeAction,
  uploadNoticeAttachmentAction,
} from "@/app/notification-actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listClasses } from "@/lib/services/classes";
import { listNotices } from "@/lib/services/notices";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";
import { Megaphone, Paperclip, Calendar, CheckCircle2 } from "lucide-react";
import { formatFriendlyDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

const CATEGORIES = ["GENERAL", "CLASS", "SECTION", "EXAM", "HOLIDAY", "URGENT"];

export default async function AdminNoticesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ classes }, { notices }] = await Promise.all([
    listClasses(db, ctx),
    listNotices(db, ctx, {
      includeInactive: sp["includeInactive"] === "true",
      page: 1,
      limit: 100,
    }),
  ]);
  const sectionOptions = classes.flatMap((c) =>
    (c.sections ?? []).map((s) => ({
      value: s.id,
      label: `${c.name} ${s.name}`,
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Notices & Circulars" />

      <form method="get" className="flex items-center gap-3 p-4 bg-white rounded-lg border border-zinc-200 shadow-2xs text-xs font-mono">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="includeInactive"
            defaultChecked={sp["includeInactive"] === "true"}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 accent-zinc-950"
          />
          <span className="text-zinc-700">Include archived bulletins</span>
        </label>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md bg-zinc-950 hover:bg-zinc-800 text-white font-semibold transition-colors shadow-2xs cursor-pointer ml-2"
        >
          Filter
        </button>
        <Link
          href="/admin/notices"
          className="px-3 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors"
        >
          Clear
        </Link>
      </form>

      {notices.length === 0 ? (
        <EmptyState message="No notices published or created yet." />
      ) : (
        <div className="space-y-4">
          {notices.map((n) => (
            <div
              key={n.id}
              className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-bold text-sm text-zinc-950 font-serif">
                    {n.title}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[10px] font-semibold border border-zinc-200 uppercase">
                    {n.category}
                  </span>
                  <StatusBadge active={n.isActive} />
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border ${
                      n.isPublished
                        ? "bg-zinc-950 text-white border-zinc-950"
                        : "bg-zinc-100 text-zinc-600 border-zinc-300"
                    }`}
                  >
                    {n.isPublished ? "Published" : "Draft"}
                  </span>
                  {n.expiresAt !== null && (
                    <span className="text-[11px] font-mono text-zinc-400">
                      Expires {formatFriendlyDate(n.expiresAt)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <ConfirmButton
                    label={n.isPublished ? "Unpublish" : "Publish"}
                    confirmMessage={`${n.isPublished ? "Unpublish" : "Publish"} "${n.title}"?`}
                    run={setNoticePublishedAction.bind(null, n.id, !n.isPublished)}
                  />
                  <ConfirmButton
                    label={n.isActive ? "Archive" : "Restore"}
                    confirmMessage={n.isActive ? `Archive "${n.title}"?` : `Restore "${n.title}"?`}
                    run={
                      n.isActive
                        ? deleteNoticeAction.bind(null, n.id)
                        : restoreNoticeAction.bind(null, n.id)
                    }
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-700 leading-relaxed font-sans">{n.content}</p>

              {n.attachmentName !== null && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-600 font-mono bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <Paperclip className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="font-semibold">Attachment:</span>{" "}
                  <AttachmentLink
                    homeworkId={n.id}
                    attachmentId={n.id}
                    label={n.attachmentName}
                    kind="notice"
                  />
                </div>
              )}

              <details className="text-xs text-zinc-600 pt-1">
                <summary className="cursor-pointer font-mono font-semibold text-zinc-800 hover:text-black">
                  Edit Bulletin Details
                </summary>
                <div className="mt-3 p-4 bg-zinc-50 rounded border border-zinc-200">
                  <SmartForm
                    action={updateNoticeAction.bind(null, n.id)}
                    submitLabel="Save Changes"
                    fields={[
                      { name: "title", label: "Title", required: true, defaultValue: n.title },
                      { name: "content", label: "Content", type: "textarea", required: true, defaultValue: n.content },
                      {
                        name: "category",
                        label: "Category",
                        type: "select",
                        defaultValue: n.category,
                        options: CATEGORIES.map((c) => ({ value: c, label: c })),
                      },
                      { name: "expiresAt", label: "Expiry Date", type: "date", defaultValue: n.expiresAt ?? "" },
                    ]}
                  />
                  {n.isActive && (
                    <div className="mt-4 pt-4 border-t border-zinc-200">
                      <SmartForm
                        action={uploadNoticeAttachmentAction.bind(null, n.id)}
                        submitLabel="Upload Attachment"
                        fields={[{ name: "file", label: "Attach Document (PDF/Images, ≤10 MB)", type: "file", required: true }]}
                      />
                    </div>
                  )}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {/* New Notice Section */}
      <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs max-w-2xl">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100">
          <Megaphone className="w-4 h-4 text-zinc-900" />
          <h3 className="text-sm font-bold text-zinc-950 font-mono uppercase tracking-wider">
            Issue New Official Notice
          </h3>
        </div>
        <SmartForm
          action={createNoticeAction}
          submitLabel="Create Notice"
          fields={[
            { name: "title", label: "Circular Title", required: true, placeholder: "e.g. Annual Sports Day Notification" },
            { name: "content", label: "Detailed Content", type: "textarea", required: true, placeholder: "Provide comprehensive instructions..." },
            {
              name: "category",
              label: "Category",
              type: "select",
              required: true,
              options: CATEGORIES.map((c) => ({ value: c, label: c })),
            },
            {
              name: "audienceType",
              label: "Target Audience",
              type: "select",
              required: true,
              options: [
                { value: "SCHOOL", label: "Entire School Community" },
                { value: "CLASS", label: "Specific Class Cohort" },
                { value: "SECTION", label: "Specific Section" },
                { value: "TEACHERS", label: "Teaching Staff Only" },
                { value: "PARENTS", label: "Guardians & Parents Only" },
              ],
            },
            {
              name: "classId",
              label: "Class (if Class audience selected)",
              type: "select",
              options: classes.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              name: "sectionId",
              label: "Section (if Section audience selected)",
              type: "select",
              options: sectionOptions,
            },
            { name: "expiresAt", label: "Expiry Date (optional)", type: "date" },
            {
              name: "publishNow",
              label: "Publish immediately (deliver to recipients & send notifications)",
              type: "checkbox",
            },
          ]}
        />
        <p className="mt-3 text-[11px] text-zinc-500 font-mono">
          Published notices fan out in-app notifications to all users in the targeted audience. If left unchecked, bulletins are saved as drafts.
        </p>
      </div>
    </div>
  );
}
