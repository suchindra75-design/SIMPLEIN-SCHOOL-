import { NextResponse } from "next/server";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getReportCardPdfUrl } from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived SIGNED URL of the generated PDF (never a public
 * URL); `?format=json` returns `{ url }` instead for API clients.
 * Parents/students: PUBLISHED snapshots only (service + storage RLS).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    const url = await getReportCardPdfUrl(db, ctx, (await params).id);
    if (new URL(request.url).searchParams.get("format") === "json") {
      return ok({ url });
    }
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
