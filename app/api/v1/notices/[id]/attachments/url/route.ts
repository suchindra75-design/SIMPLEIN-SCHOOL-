import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getNoticeAttachmentUrl } from "@/lib/services/notices";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Short-lived signed attachment URL; same audience scope as the notice. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok({ url: await getNoticeAttachmentUrl(db, ctx, (await params).id) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
