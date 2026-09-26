import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  deleteTimetableSlot,
  updateTimetableSlot,
} from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { timetableSlotUpdateSchema } from "@/lib/validation/timetable";

export const dynamic = "force-dynamic";

/** Edit a timetable slot. Admin only, audited (409 on teacher clash). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = timetableSlotUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateTimetableSlot(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Delete a timetable slot. Admin only, audited. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await deleteTimetableSlot(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
