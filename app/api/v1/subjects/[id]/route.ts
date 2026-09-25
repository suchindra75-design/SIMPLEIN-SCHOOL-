import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { updateSubject } from "@/lib/services/subjects";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { subjectUpdateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = subjectUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await updateSubject(db, ctx, (await params).id, {
        name: patch.name,
        code: patch.code,
        orderIndex: patch.orderIndex,
        isActive: patch.isActive,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
