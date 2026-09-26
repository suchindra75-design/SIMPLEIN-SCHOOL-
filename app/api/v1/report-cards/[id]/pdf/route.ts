import { NextResponse } from "next/server";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getReportCardPdfUrl } from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived SIGNED URL of the generated PDF (never a public
 * URL). Parents: PUBLISHED snapshots only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    const url = await getReportCardPdfUrl(db, ctx, (await params).id);
    return ok({ url });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
