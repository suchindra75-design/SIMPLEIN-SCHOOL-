import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  removeExamSchedule,
  upsertExamSchedule,
} from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { examScheduleSchema } from "@/lib/validation/exams";

export const dynamic = "force-dynamic";

/** Upsert the 1:1 room/invigilator schedule for a subject exam. Admin only. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = examScheduleSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await upsertExamSchedule(db, ctx, (await params).id, input));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Remove the schedule row (date/time config untouched). Admin only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await removeExamSchedule(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
