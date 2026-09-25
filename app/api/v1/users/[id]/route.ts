import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getUser, updateUser } from "@/lib/services/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { userUpdateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getUser(db, ctx, (await params).id));
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
    const patch = userUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateUser(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
