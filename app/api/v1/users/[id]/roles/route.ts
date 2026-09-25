import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { addUserRole } from "@/lib/services/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { manageableRoleSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ role: manageableRoleSchema });

/** Grant TEACHER/PARENT to a same-school user. Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const { role } = bodySchema.parse(body);
    const db = await createServerSupabaseClient();
    await addUserRole(db, ctx, (await params).id, role);
    return ok({ userId: (await params).id, role }, undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
