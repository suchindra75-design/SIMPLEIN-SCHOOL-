import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { voidPaymentRecord } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { feeVoidSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/** Void a payment record (maker ≠ checker; record retained + audited). Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = feeVoidSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await voidPaymentRecord(db, ctx, (await params).id, input));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
