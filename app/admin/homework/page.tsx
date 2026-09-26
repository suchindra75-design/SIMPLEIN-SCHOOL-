import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import {
  createHomeworkAction,
  deleteHomeworkAction,
  restoreHomeworkAction,
  updateHomeworkAction,
  uploadHomeworkAttachmentAction,
} from "@/app/homework-actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listClasses } from "@/lib/services/classes";
import { listSubjects } from "@/lib/services/subjects";
import { listHomework } from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ classes }, { subjects }] = await Promise.all([
    listClasses(db, ctx),
    listSubjects(db, ctx),
  ]);
  const selectedClass = classes.find((c) => c.id === sp["classId"]);
  const sectionOptions = (selectedClass?.sections ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const { homework } = await listHomework(db, ctx, {
    sectionId: sp["sectionId"],
    subjectId: sp["subjectId"],
    includeInactive: sp["includeInactive"] === "true",
    page: 1,
    limit: 100,
  });

  return (
    <main>
      <PageHeader title="Homework" />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Class</span>
          <select name="classId" defaultValue={sp["classId"] ?? ""} className="rounded border px-2 py-1.5">
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Section</span>
          <select name="sectionId" defaultValue={sp["sectionId"] ?? ""} className="rounded border px-2 py-1.5">
            <option value="">All</option>
            {sectionOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Subject</span>
          <select name="subjectId" defaultValue={sp["subjectId"] ?? ""} className="rounded border px-2 py-1.5">
            <option value="">All</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" name="includeInactive" defaultChecked={sp["includeInactive"] === "true"} className="h-4 w-4" />
          <span className="text-gray-600">Include deleted</span>
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Filter
        </button>
        <Link href="/admin/homework" className="rounded border px-3 py-1.5 text-sm text-gray-600">
          Clear
        </Link>
      </form>

      {homework.length === 0 ? (
        <EmptyState message="No homework found." />
      ) : (
        <ul className="space-y-3 text-sm">
          {homework.map((h) => (
            <li key={h.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{h.title}</span>
                <StatusBadge active={h.isActive} />
                <span className="text-gray-600">
                  {h.classes?.name ?? ""} {h.sections?.name ? ` ${h.sections.name}` : ""} ·{" "}
                  {h.subjects?.name ?? "—"} · {h.teachers?.displayName ?? "—"} · due {h.dueDate}
                </span>
                <span className="ml-auto">
                  <ConfirmButton
                    label={h.isActive ? "Delete" : "Restore"}
                    confirmMessage={h.isActive ? `Delete "${h.title}"?` : `Restore "${h.title}"?`}
                    run={
                      h.isActive
                        ? deleteHomeworkAction.bind(null, h.id, "/admin/homework")
                        : restoreHomeworkAction.bind(null, h.id, "/admin/homework")
                    }
                  />
                </span>
              </div>
              <p className="mt-1 text-gray-700">{h.description}</p>
              <div className="mt-2">
                <SmartForm
                  action={updateHomeworkAction.bind(null, h.id, "/admin/homework")}
                  submitLabel="Update"
                  fields={[
                    { name: "title", label: "Title", required: true, defaultValue: h.title },
                    { name: "description", label: "Description", type: "textarea", required: true, defaultValue: h.description },
                    { name: "assignedOn", label: "Assigned date", type: "date", defaultValue: h.assignedOn },
                    { name: "dueDate", label: "Due date", type: "date", required: true, defaultValue: h.dueDate },
                  ]}
                />
              </div>
              {h.isActive && (
                <div className="mt-2">
                  <SmartForm
                    action={uploadHomeworkAttachmentAction.bind(null, h.id, "/admin/homework")}
                    submitLabel="Add attachment"
                    fields={[{ name: "file", label: "File (PDF/images/Office, ≤10 MB)", type: "file", required: true }]}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-8 font-semibold">New homework</h3>
      {sectionOptions.length === 0 ? (
        <p className="text-sm text-gray-600">Pick a class above to choose a section.</p>
      ) : (
        <SmartForm
          action={createHomeworkAction.bind(null, sp["sectionId"] ?? "", "/admin/homework")}
          submitLabel="Create homework"
          fields={[
            {
              name: "sectionId",
              label: "Section",
              type: "select",
              required: true,
              options: sectionOptions,
            },
            {
              name: "subjectId",
              label: "Subject",
              type: "select",
              required: true,
              options: subjects.map((s) => ({ value: s.id, label: s.name })),
            },
            { name: "title", label: "Title", required: true },
            { name: "description", label: "Description", type: "textarea", required: true },
            { name: "assignedOn", label: "Assigned date", type: "date" },
            { name: "dueDate", label: "Due date", type: "date", required: true },
          ]}
        />
      )}
      <Link href="/admin" className="mt-4 inline-block text-sm underline">
        Back
      </Link>
    </main>
  );
}
