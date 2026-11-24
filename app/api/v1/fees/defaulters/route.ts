import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listFeeDefaulters } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Outstanding-dues (defaulters) report for the caller's school. Admin only
 * (enforced in the service). Optional filters: ?classId= &sectionId= &minDue=
 * &includeInactive=true. Returns defaulters sorted by amount owed, plus totals.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    const url = new URL(request.url);
    const classId = url.searchParams.get("classId") ?? undefined;
    const sectionId = url.searchParams.get("sectionId") ?? undefined;
    const minDueRaw = url.searchParams.get("minDue");
    const minDue = minDueRaw !== null && minDueRaw !== "" ? Number(minDueRaw) : undefined;
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    return ok(
      await listFeeDefaulters(db, ctx, {
        classId,
        sectionId,
        minDue: minDue !== undefined && Number.isFinite(minDue) ? minDue : undefined,
        includeInactive,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
