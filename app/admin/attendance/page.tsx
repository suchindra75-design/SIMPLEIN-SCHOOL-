import { AttendanceMarker } from "@/app/components/AttendanceMarker";
import { requireRole } from "@/lib/auth/session";
import {
  getSectionSummary,
  todayFor,
} from "@/lib/services/attendance";
import { listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, ErrorAlert } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const today = todayFor(ctx);
  const { classes } = await listClasses(db, ctx);
  const selectedClass = classes.find((c) => c.id === sp["classId"]);
  const sectionId = sp["sectionId"] ?? "";
  const date = sp["date"] ?? "";

  let summary: Awaited<ReturnType<typeof getSectionSummary>> | null = null;
  let loadError: string | undefined;
  const valid =
    sectionId !== "" && DATE_RE.test(date) && selectedClass !== undefined;
  if (valid) {
    try {
      summary = await getSectionSummary(db, ctx, sectionId, date);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Failed to load";
    }
  }

  return (
    <main>
      <h2 className="text-xl font-semibold">Attendance</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.school.name} · Today: {today} (dates are school-local)
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Class</span>
          <select name="classId" defaultValue={sp["classId"] ?? ""} className="rounded border px-2 py-1.5">
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Section</span>
          <select name="sectionId" defaultValue={sectionId} className="rounded border px-2 py-1.5">
            <option value="">Select…</option>
            {(selectedClass?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Date</span>
          <input type="date" name="date" defaultValue={date} max={today} className="rounded border px-2 py-1.5" />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          View
        </button>
      </form>

      <ErrorAlert error={loadError} />

      {summary !== null && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="rounded border p-3">
            <p className="text-xs text-gray-600">Session</p>
            <p className="font-semibold">{summary.sessionExists ? "Recorded" : "Not recorded"}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-gray-600">Present</p>
            <p className="font-semibold">{summary.present}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-gray-600">Absent</p>
            <p className="font-semibold">{summary.absent}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-gray-600">Leave</p>
            <p className="font-semibold">{summary.leave}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-xs text-gray-600">Attendance %</p>
            <p className="font-semibold">
              {summary.percentage === null ? "—" : `${summary.percentage}%`}
            </p>
          </div>
        </div>
      )}

      {!valid ? (
        <div className="mt-6">
          <EmptyState message="Select a class, section, and date to view or edit attendance." />
        </div>
      ) : (
        <div className="mt-6">
          <h3 className="mb-2 font-semibold">Edit attendance</h3>
          <AttendanceMarker
            sections={classes.flatMap((c) =>
              (c.sections ?? []).map((s) => ({
                id: s.id,
                name: s.name,
                classes: { name: c.name },
              })),
            )}
            today={today}
            initialSectionId={sectionId}
            initialDate={date}
          />
        </div>
      )}
    </main>
  );
}
