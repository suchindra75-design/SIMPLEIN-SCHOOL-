import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listHomework } from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { queryBoolSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  dueFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeInactive: queryBoolSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Auto-scoped homework list: admin → school; teacher → assigned sections; parent → children's sections. */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { homework, total } = await listHomework(db, ctx, q);
    return ok(homework, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
