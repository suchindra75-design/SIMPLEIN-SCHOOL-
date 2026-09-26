import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { updateFeeStructure } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { feeStructureUpdateSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/** Edit a fee structure. Admin only; frozen when verified records exist (409). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = feeStructureUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateFeeStructure(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
