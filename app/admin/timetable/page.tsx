import { publicErrorMessage } from "@/lib/errors/public-error";
import { requireRole } from "@/lib/auth/session";
import {
  createTimetableSlotAction,
  deleteTimetableSlotAction,
  updateTimetableSlotAction,
} from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { WeeklyTimetable } from "@/app/components/WeeklyTimetable";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
import { listClasses } from "@/lib/services/classes";
import { listSubjects } from "@/lib/services/subjects";
import { listTeachers } from "@/lib/services/teachers";
import { listSectionTimetable } from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminTimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { classes } = await listClasses(db, ctx);
  const selectedClass = classes.find((c) => c.id === sp["classId"]);
  const sectionId =
    sp["sectionId"] !== undefined && UUID_RE.test(sp["sectionId"])
      ? sp["sectionId"]
      : (selectedClass?.sections?.[0]?.id ?? "");

  let slots: Awaited<ReturnType<typeof listSectionTimetable>>["slots"] = [];
  let loadError: string | undefined;
  if (sectionId !== "") {
    try {
      ({ slots } = await listSectionTimetable(db, ctx, sectionId));
    } catch (error) {
      loadError = publicErrorMessage(error, "page:/admin/timetable");
    }
  }

  const [{ subjects }, { teachers }] = await Promise.all([
    listSubjects(db, ctx),
    listTeachers(db, ctx, { page: 1, limit: 200 }),
  ]);

  return (
    <div>
      <h1 className="page-title">Timetable</h1>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.school.name} · Weekly view · conflicts prevented server-side
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="ui-label">Class</span>
          <select name="classId" defaultValue={sp["classId"] ?? ""} className="ui-input">
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="ui-label">Section</span>
          <select name="sectionId" defaultValue={sectionId} className="ui-input">
            <option value="">Select…</option>
            {(selectedClass?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-btn ui-btn-secondary">
          View
        </button>
      </form>

      {loadError !== undefined && (
        <p role="alert" className="ui-alert ui-alert-error mt-4">
          {loadError}
        </p>
      )}

      {sectionId === "" ? (
        <div className="mt-6">
          <EmptyState message="Select a class and section to view its timetable." />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <WeeklyTimetable slots={slots} />
          </div>

          <h3 className="mb-2 mt-8 font-semibold">Entries</h3>
          {slots.length === 0 ? (
            <p className="text-sm text-gray-500">No entries yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {slots.map((s) => (
                <li key={s.id} className="ui-panel">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">
                      {DAYS[s.dayOfWeek - 1] ?? "Day"} · Period {s.periodIndex + 1}
                    </span>
                    <span className="text-gray-600">
                      {s.subjects?.name ?? "—"} · {s.teachers?.displayName ?? "No teacher"} ·{" "}
                      {s.startsAt}–{s.endsAt}
                      {s.room ? ` · ${s.room}` : ""}
                    </span>
                    <span className="ml-auto">
                      <ConfirmButton
                        label="Delete"
                        confirmMessage="Delete this timetable entry?"
                        run={deleteTimetableSlotAction.bind(null, sectionId, s.id)}
                      />
                    </span>
                  </div>
                  <div className="mt-2">
                    <SmartForm
                      action={updateTimetableSlotAction.bind(null, sectionId, s.id)}
                      submitLabel="Update entry"
                      fields={[
                        {
                          name: "teacherId",
                          label: "Teacher",
                          type: "select",
                          defaultValue: s.teacherId ?? "",
                          options: teachers.map((t) => ({
                            value: t.id,
                            label: t.displayName,
                          })),
                        },
                        { name: "startsAt", label: "Start (HH:MM)", defaultValue: s.startsAt },
                        { name: "endsAt", label: "End (HH:MM)", defaultValue: s.endsAt },
                        { name: "room", label: "Room", defaultValue: s.room ?? "" },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h4 className="mb-2 mt-4 font-medium">New entry</h4>
          <SmartForm
            action={createTimetableSlotAction.bind(null, sectionId)}
            submitLabel="Create entry"
            fields={[
              {
                name: "subjectId",
                label: "Subject",
                type: "select",
                required: true,
                options: subjects.map((s) => ({ value: s.id, label: s.name })),
              },
              {
                name: "teacherId",
                label: "Teacher",
                type: "select",
                options: teachers.map((t) => ({ value: t.id, label: t.displayName })),
              },
              {
                name: "dayOfWeek",
                label: "Day (1=Mon … 7=Sun)",
                type: "number",
                required: true,
                defaultValue: "1",
              },
              { name: "periodIndex", label: "Period index (0-based)", type: "number", required: true, defaultValue: "0" },
              { name: "startsAt", label: "Start time (HH:MM)", required: true, placeholder: "09:30" },
              { name: "endsAt", label: "End time (HH:MM)", required: true, placeholder: "10:10" },
              { name: "room", label: "Room" },
            ]}
          />
        </>
      )}
    </div>
  );
}
