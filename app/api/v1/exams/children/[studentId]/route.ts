import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listChildExamSchedule } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Exam schedule for one linked child. Parent: linked children only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listChildExamSchedule(db, ctx, (await params).studentId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
