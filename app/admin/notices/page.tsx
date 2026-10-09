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
    <main>
      <PageHeader title="Notices" />

      <form method="get" className="mb-4 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="includeInactive" defaultChecked={sp["includeInactive"] === "true"} className="h-4 w-4" />
          <span className="text-gray-600">Include archived</span>
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Filter
        </button>
        <Link href="/admin/notices" className="rounded border px-3 py-1.5 text-sm text-gray-600">
          Clear
        </Link>
      </form>

      {notices.length === 0 ? (
        <EmptyState message="No notices yet." />
      ) : (
        <ul className="space-y-3 text-sm">
          {notices.map((n) => (
            <li key={n.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{n.title}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {n.category}
                </span>
                <StatusBadge active={n.isActive} />
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    n.isPublished ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {n.isPublished ? "Published" : "Unpublished"}
                </span>
                {n.expiresAt !== null && (
                  <span className="text-gray-500">Expires {n.expiresAt}</span>
                )}
                <span className="ml-auto flex gap-2">
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
                </span>
              </div>
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
              <div className="mt-2">
                <SmartForm
                  action={updateNoticeAction.bind(null, n.id)}
                  submitLabel="Update notice"
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
                    { name: "expiresAt", label: "Expiry date", type: "date", defaultValue: n.expiresAt ?? "" },
                  ]}
                />
              </div>
              {n.isActive && (
                <div className="mt-2">
                  <SmartForm
                    action={uploadNoticeAttachmentAction.bind(null, n.id)}
                    submitLabel="Set attachment"
                    fields={[{ name: "file", label: "File (PDF/images/Office, ≤10 MB)", type: "file", required: true }]}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-8 font-semibold">New notice</h3>
      <SmartForm
        action={createNoticeAction}
        submitLabel="Create notice"
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "content", label: "Content", type: "textarea", required: true },
          {
            name: "category",
            label: "Category",
            type: "select",
            required: true,
            options: CATEGORIES.map((c) => ({ value: c, label: c })),
          },
          {
            name: "audienceType",
            label: "Audience",
            type: "select",
            required: true,
            options: [
              { value: "SCHOOL", label: "Entire school" },
              { value: "CLASS", label: "Specific class" },
              { value: "SECTION", label: "Specific section" },
              { value: "TEACHERS", label: "Teachers" },
              { value: "PARENTS", label: "Parents" },
            ],
          },
          {
            name: "classId",
            label: "Class (for CLASS audience)",
            type: "select",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "sectionId",
            label: "Section (for SECTION audience)",
            type: "select",
            options: sectionOptions,
          },
          { name: "expiresAt", label: "Expiry date (optional)", type: "date" },
          {
            name: "publishNow",
            label: "Publish immediately (deliver to recipients & send notifications)",
            type: "checkbox",
          },
        ]}
      />
      <p className="mt-2 text-xs text-gray-500">
        Published notices fan out in-app notifications to all users in the targeted audience.
      </p>
    </main>
  );
}
