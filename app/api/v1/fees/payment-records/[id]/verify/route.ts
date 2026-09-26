import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { verifyPaymentRecord } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Verify a payment record (maker ≠ checker — second-person rule). Admin only. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await verifyPaymentRecord(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
