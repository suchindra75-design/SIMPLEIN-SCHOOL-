import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createPaymentOrder, listPaymentOrdersForReview } from "@/lib/services/online-payments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paymentOrderCreateSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/**
 * Start an online (UPI) payment for one fee. Parent (linked child) or student
 * (own fee). Returns what Razorpay Checkout needs; no money moves here.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const input = paymentOrderCreateSchema.parse(await request.json());
    const db = await createServerSupabaseClient();
    return ok(
      await createPaymentOrder(db, ctx, {
        studentFeeId: input.studentFeeId,
        amount: input.amount ?? null,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Admin: online payments that need review (captured but not applied). */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listPaymentOrdersForReview(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
