import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listPyqs } from "@/lib/services/pyqs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paginationSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const listQuerySchema = paginationSchema.extend({
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  yearLabel: z.string().max(20).optional(),
  examBoardName: z.string().max(120).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

/** Browse the school's PYQ bank (filterable). All roles read. */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { pyqs, total } = await listPyqs(db, ctx, q);
    return ok(pyqs, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
