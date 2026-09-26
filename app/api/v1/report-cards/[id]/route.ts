import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { updateReportCardRemarks } from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ remarks: z.string().trim().max(1000) });

/** Update remarks on the report-card snapshot. Admin only, audited. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const { remarks } = bodySchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateReportCardRemarks(db, ctx, (await params).id, remarks));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
