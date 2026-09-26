import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getHomeworkAttachmentUrl } from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Short-lived signed download URL; same scope as the homework read. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { attachmentId } = await params;
    const db = await createServerSupabaseClient();
    return ok({ url: await getHomeworkAttachmentUrl(db, ctx, attachmentId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
