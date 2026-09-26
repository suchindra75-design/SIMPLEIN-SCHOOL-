import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listFeeStructures } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Fee structures: admin → all; parent → structures assigned to linked children. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listFeeStructures(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
