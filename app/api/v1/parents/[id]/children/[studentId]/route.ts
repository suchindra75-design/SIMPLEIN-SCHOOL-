import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { unlinkChild } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id, studentId } = await params;
    const db = await createServerSupabaseClient();
    return ok(await unlinkChild(db, ctx, id, studentId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
