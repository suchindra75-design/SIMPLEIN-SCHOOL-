import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getParent, updateParent } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parentUpdateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getParent(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = parentUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateParent(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
