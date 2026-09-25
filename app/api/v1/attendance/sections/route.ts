import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listAttendanceSections } from "@/lib/services/attendance";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Sections the caller may view/mark: admin → all active; teacher → assigned. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listAttendanceSections(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
