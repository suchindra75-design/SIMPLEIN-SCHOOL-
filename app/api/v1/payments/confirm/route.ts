import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { confirmCheckoutPayment } from "@/lib/services/online-payments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paymentConfirmSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/**
 * Checkout success callback. The signature is verified and the payment is
 * fetched from Razorpay before anything is recorded. Returns PAID, REVIEW or
 * PROCESSING (the webhook will finish it).
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const input = paymentConfirmSchema.parse(await request.json());
    const db = await createServerSupabaseClient();
    return ok(
      await confirmCheckoutPayment(db, ctx, {
        gatewayOrderId: input.razorpayOrderId,
        gatewayPaymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
