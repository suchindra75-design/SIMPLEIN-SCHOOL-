import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listMyTimetable } from "@/lib/services/timetable";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Caller-scoped timetable: teacher → own entries; parent → children's sections. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listMyTimetable(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
