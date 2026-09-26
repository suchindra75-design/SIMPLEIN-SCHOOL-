import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listGradingSystems } from "@/lib/services/grades";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** School's grading systems + rules. Admin only. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listGradingSystems(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
