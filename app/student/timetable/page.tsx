import { requireRole } from "@/lib/auth/session";
import { WeeklyTimetable } from "@/app/components/WeeklyTimetable";
import { listMyTimetable } from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student timetable: own section only (read-only). */
export default async function StudentTimetablePage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const { slots } = await listMyTimetable(db, ctx);

  return (
    <main>
      <h2 className="text-xl font-semibold">My timetable</h2>
      <p className="mt-1 text-sm text-gray-600">{ctx.school.name}</p>
      <div className="mt-4">
        {slots.length === 0 ? (
          <EmptyState message="No timetable entries for your section yet." />
        ) : (
          <WeeklyTimetable slots={slots} />
        )}
      </div>
    </main>
  );
}
