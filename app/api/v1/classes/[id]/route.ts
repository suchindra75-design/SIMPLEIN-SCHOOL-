import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getClass, updateClass } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classUpdateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getClass(db, ctx, (await params).id));
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
    const patch = classUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await updateClass(db, ctx, (await params).id, {
        name: patch.name,
        orderIndex: patch.orderIndex,
        isActive: patch.isActive,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
