import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { markNotificationRead } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Mark one notification as read (idempotent; own rows only). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await markNotificationRead(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
