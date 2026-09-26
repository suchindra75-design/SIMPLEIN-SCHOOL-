import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { updateGradingSystem } from "@/lib/services/grades";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { gradingSystemUpdateSchema } from "@/lib/validation/marks";

export const dynamic = "force-dynamic";

/** Update a grading system / replace its rules. Admin only, audited. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = gradingSystemUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateGradingSystem(db, ctx, (await params).id, input));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
