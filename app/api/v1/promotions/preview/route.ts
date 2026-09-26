import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { previewPromotion } from "@/lib/services/promotions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { promotionPreviewSchema } from "@/lib/validation/promotions";

export const dynamic = "force-dynamic";

/** Eligible students + proposed next class/section. Admin only. */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = promotionPreviewSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await previewPromotion(db, ctx, input));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
