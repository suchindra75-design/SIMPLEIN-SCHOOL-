import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { recordPayment } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { feePaymentRecordSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/**
 * Record a payment RECEIVED BY THE SCHOOL (offline cash/cheque/transfer).
 * This is NOT an online transaction — no gateway, no refunds. Overpayment
 * rejected (409). Admin only, audited.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentFeeId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = feePaymentRecordSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await recordPayment(db, ctx, (await params).studentFeeId, {
        amount: input.amount,
        paidOn: input.paidOn,
        mode: input.mode,
        referenceNo: input.referenceNo,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
