import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { removeTeacherAssignment } from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id, assignmentId } = await params;
    const db = await createServerSupabaseClient();
    return ok(await removeTeacherAssignment(db, ctx, id, assignmentId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
