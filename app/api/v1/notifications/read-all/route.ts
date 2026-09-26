import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { markAllNotificationsRead } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Mark all as read (own rows only). */
export async function POST() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await markAllNotificationsRead(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
