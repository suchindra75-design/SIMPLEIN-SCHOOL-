import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createTimetableSlot, listSectionTimetable } from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { timetableSlotCreateSchema } from "@/lib/validation/timetable";

export const dynamic = "force-dynamic";

/** Weekly grid for a section (admin/teacher-scope/parent-child-section). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listSectionTimetable(db, ctx, (await params).sectionId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Create a timetable slot. Admin only, audited (409 on conflicts). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = timetableSlotCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createTimetableSlot(db, ctx, (await params).sectionId, {
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        academicYearId: input.academicYearId,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        room: input.room,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
