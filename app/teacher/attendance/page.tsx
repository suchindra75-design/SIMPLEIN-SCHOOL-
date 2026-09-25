import { AttendanceMarker } from "@/app/components/AttendanceMarker";
import { requireRole } from "@/lib/auth/session";
import { todayFor, listAttendanceSections } from "@/lib/services/attendance";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherAttendancePage() {
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const { sections } = await listAttendanceSections(db, ctx);
  const today = todayFor(ctx);

  return (
    <main>
      <h2 className="text-xl font-semibold">Attendance</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Today: {today}
      </p>
      {sections.length === 0 ? (
        <div className="mt-4 rounded border border-dashed p-8 text-center text-sm text-gray-500">
          No assigned sections. You can mark attendance only for sections where
          you are the class teacher or a subject assignee.
        </div>
      ) : (
        <div className="mt-4">
          <AttendanceMarker sections={sections} today={today} />
        </div>
      )}
    </main>
  );
}
