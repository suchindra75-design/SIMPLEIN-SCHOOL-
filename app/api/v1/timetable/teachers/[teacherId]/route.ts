import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listTeacherTimetable } from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Weekly grid for a teacher (admin or self-teacher). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listTeacherTimetable(db, ctx, (await params).teacherId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
