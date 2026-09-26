import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listNotifications } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paginationSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const listQuerySchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
  type: z
    .enum(["NOTICE", "HOMEWORK", "EXAM", "RESULT", "ATTENDANCE", "ACCOUNT"])
    .optional(),
});

/** The caller's own inbox (recipient isolation at RLS + service). */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { notifications, total } = await listNotifications(db, ctx, q);
    return ok(notifications, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
