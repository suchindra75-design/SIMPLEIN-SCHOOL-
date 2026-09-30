import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listNotices } from "@/lib/services/notices";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paginationSchema, queryBoolSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const listQuerySchema = paginationSchema.extend({
  category: z
    .enum(["GENERAL", "CLASS", "SECTION", "EXAM", "HOLIDAY", "URGENT"])
    .optional(),
  includeInactive: queryBoolSchema.optional(),
});

/** Audience-filtered notice feed (expired excluded; server-side targeting). */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { notices, total } = await listNotices(db, ctx, q);
    return ok(notices, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
