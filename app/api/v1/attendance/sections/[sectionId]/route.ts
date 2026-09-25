import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getMarkingPayload } from "@/lib/services/attendance";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { attendanceDateQuerySchema } from "@/lib/validation/attendance";

export const dynamic = "force-dynamic";

/**
 * Marking-screen payload for a section + date: roster (enrolled students for
 * the applicable academic year) + existing session/records. Admin/teacher
 * only; teacher link-scoped. Date is school-local YYYY-MM-DD.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { date } = attendanceDateQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    return ok(await getMarkingPayload(db, ctx, (await params).sectionId, date));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
