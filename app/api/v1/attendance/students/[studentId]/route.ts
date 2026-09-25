import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getStudentAttendance } from "@/lib/services/attendance";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { attendanceRangeQuerySchema } from "@/lib/validation/attendance";

export const dynamic = "force-dynamic";

/** Daily history for one student. Admin / assigned-teacher / linked-parent. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const q = attendanceRangeQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { records, total } = await getStudentAttendance(
      db,
      ctx,
      (await params).studentId,
      q,
    );
    return ok(records, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
