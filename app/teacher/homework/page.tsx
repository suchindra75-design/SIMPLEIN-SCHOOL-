import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import {
  createHomeworkAction,
  deleteHomeworkAction,
  updateHomeworkAction,
  uploadHomeworkAttachmentAction,
} from "@/app/homework-actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listSubjects } from "@/lib/services/subjects";
import {
  getTeacherScope,
  listTeacherSections,
} from "@/lib/services/teachers";
import { listHomework } from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Teacher view: authorized sections only; manages own homework. */
export default async function TeacherHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const scope = await getTeacherScope(db, ctx);
  const { sections } =
    scope === null ? { sections: [] } : await listTeacherSections(db, ctx, scope.teacherId);
  const sectionId =
    sp["sectionId"] !== undefined && UUID_RE.test(sp["sectionId"])
      ? sp["sectionId"]
      : (sections[0]?.id ?? "");
  const { subjects } = await listSubjects(db, ctx);
  const { homework } =
    sectionId === "" ? { homework: [] } : await listHomework(db, ctx, { sectionId, page: 1, limit: 50 });

  return (
    <main>
      <h2 className="text-xl font-semibold">Homework</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Your sections only
      </p>

      {scope === null ? (
        <p className="mt-4 text-sm text-gray-600">
          No teacher profile is linked to your login yet.
        </p>
      ) : sections.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No assigned sections yet." />
        </div>
      ) : (
        <>
          <form method="get" className="mt-4">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Section</span>
              <select name="sectionId" defaultValue={sectionId} className="rounded border px-2 py-1.5">
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.classes?.name ? `${s.classes.name} ` : ""}
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
              View
            </button>
          </form>

          <h3 className="mb-2 mt-6 font-semibold">Existing homework</h3>
          {homework.length === 0 ? (
            <EmptyState message="No homework for this section yet." />
          ) : (
            <ul className="space-y-3 text-sm">
              {homework.map((h) => (
                <li key={h.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">{h.title}</span>
                    <span className="text-gray-600">
                      {h.subjects?.name ?? "—"} · due {h.dueDate}
                    </span>
                    <span className="ml-auto">
                      <ConfirmButton
                        label="Delete"
                        confirmMessage={`Delete "${h.title}"?`}
                        run={deleteHomeworkAction.bind(null, h.id, `/teacher/homework?sectionId=${sectionId}`)}
                      />
                    </span>
                  </div>
                  <p className="mt-1 text-gray-700">{h.description}</p>
                  <div className="mt-2">
                    <SmartForm
                      action={updateHomeworkAction.bind(null, h.id, `/teacher/homework?sectionId=${sectionId}`)}
                      submitLabel="Update"
                      fields={[
                        { name: "title", label: "Title", required: true, defaultValue: h.title },
                        { name: "description", label: "Description", type: "textarea", required: true, defaultValue: h.description },
                        { name: "dueDate", label: "Due date", type: "date", required: true, defaultValue: h.dueDate },
                      ]}
                    />
                  </div>
                  <div className="mt-2">
                    <SmartForm
                      action={uploadHomeworkAttachmentAction.bind(null, h.id, `/teacher/homework?sectionId=${sectionId}`)}
                      submitLabel="Add attachment"
                      fields={[{ name: "file", label: "File (PDF/images/Office, ≤10 MB)", type: "file", required: true }]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h4 className="mb-2 mt-6 font-medium">New homework</h4>
          <SmartForm
            action={createHomeworkAction.bind(null, sectionId, `/teacher/homework?sectionId=${sectionId}`)}
            submitLabel="Create homework"
            fields={[
              {
                name: "subjectId",
                label: "Subject",
                type: "select",
                required: true,
                options: subjects.map((s) => ({ value: s.id, label: s.name })),
              },
              { name: "title", label: "Title", required: true },
              { name: "description", label: "Description", type: "textarea", required: true },
              { name: "dueDate", label: "Due date", type: "date", required: true },
            ]}
          />
          <p className="mt-2 text-xs text-gray-500">
            You can assign homework for subjects you teach (or all subjects for
            sections where you are the class teacher).
          </p>
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href="/teacher" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
