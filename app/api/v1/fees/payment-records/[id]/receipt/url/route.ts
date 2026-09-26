import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getPaymentReceiptUrl } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Short-lived signed receipt URL; same scope as the fee read. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok({ url: await getPaymentReceiptUrl(db, ctx, (await params).id) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
