import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createHomework } from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { homeworkCreateSchema } from "@/lib/validation/homework";

export const dynamic = "force-dynamic";

/** Create homework for a section. Admin or authorized teacher, audited. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = homeworkCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createHomework(db, ctx, (await params).sectionId, input),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
