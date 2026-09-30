import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createParent, listParents } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paginationSchema, queryBoolSchema } from "@/lib/validation/common";
import { parentCreateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

const listQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  isActive: queryBoolSchema.optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { parents, total } = await listParents(db, ctx, q);
    return ok(parents, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = parentCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await createParent(db, ctx, input), undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
