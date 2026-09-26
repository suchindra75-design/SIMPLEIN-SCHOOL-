import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listStudentFees } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Fee summary + assignments for one student (total/paid/due/status per fee,
 * with records). Admin own school; parent linked children only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listStudentFees(db, ctx, (await params).studentId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
