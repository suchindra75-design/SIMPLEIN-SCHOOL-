import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { saveMarks } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveMarksSchema } from "@/lib/validation/marks";

export const dynamic = "force-dynamic";

/**
 * Bulk save marks (upsert; idempotent). Teacher edits rejected when locked
 * (409); admin corrections allowed. Grade computed server-side; audited.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examSubjectId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = saveMarksSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await saveMarks(db, ctx, (await params).examSubjectId, input));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
