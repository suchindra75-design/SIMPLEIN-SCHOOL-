import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { saveAttendance } from "@/lib/services/attendance";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveAttendanceSchema } from "@/lib/validation/attendance";

export const dynamic = "force-dynamic";

/**
 * Save/upsert attendance for a section + date (creates or reopens the
 * session). Admin: own school. Teacher: assigned sections only. Idempotent;
 * audits old→new status diffs.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = saveAttendanceSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await saveAttendance(db, ctx, (await params).sectionId, input));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
