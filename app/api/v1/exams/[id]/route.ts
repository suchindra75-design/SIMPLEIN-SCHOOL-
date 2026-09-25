import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getExam, updateExam } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { examUpdateSchema } from "@/lib/validation/exams";

export const dynamic = "force-dynamic";

/** Scoped exam detail with subjects + schedules. 404 on cross-tenant. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getExam(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Edit exam name/window. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = examUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateExam(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
