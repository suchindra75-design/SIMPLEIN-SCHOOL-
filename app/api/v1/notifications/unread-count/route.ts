import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { unreadCount } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Badge number (unread count for the caller only). */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok({ unread: await unreadCount(db, ctx) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
