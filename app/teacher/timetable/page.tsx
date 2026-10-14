import { requireRole } from "@/lib/auth/session";
import { WeeklyTimetable } from "@/app/components/WeeklyTimetable";
import { listMyTimetable } from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Teacher view: only timetable entries assigned to them. */
export default async function TeacherTimetablePage() {
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const { slots } = await listMyTimetable(db, ctx);

  return (
    <div>
      <h1 className="page-title">My timetable</h1>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name}
      </p>
      <div className="mt-4">
        <WeeklyTimetable slots={slots} />
      </div>
    </div>
  );
}
