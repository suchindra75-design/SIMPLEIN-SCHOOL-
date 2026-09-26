import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { promoteStudents } from "@/lib/services/promotions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { promotionRunSchema } from "@/lib/validation/promotions";

export const dynamic = "force-dynamic";

/**
 * Approve promotion for a batch (explicit admin action — never automatic).
 * Creates next-year enrollments (history preserved); hold/graduate handled
 * safely; duplicate promotion prevented (409). Admin only, audited.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = promotionRunSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await promoteStudents(db, ctx, {
        fromYearId: input.fromYearId,
        toYearId: input.toYearId,
        assignments: input.assignments,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
