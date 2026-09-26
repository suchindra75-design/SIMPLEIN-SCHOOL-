import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { assignFees } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { feeAssignSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/** Bulk-assign a fee structure to students (concession snapshot). Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = feeAssignSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await assignFees(db, ctx, (await params).id, {
        studentIds: input.studentIds,
        totalAmount: input.totalAmount,
        dueDate: input.dueDate,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
