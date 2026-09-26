import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createGradingSystem } from "@/lib/services/grades";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { gradingSystemCreateSchema } from "@/lib/validation/marks";

export const dynamic = "force-dynamic";

/** Create a grading system with rules (bands validated non-overlapping). Admin only. */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = gradingSystemCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await createGradingSystem(db, ctx, input), undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
