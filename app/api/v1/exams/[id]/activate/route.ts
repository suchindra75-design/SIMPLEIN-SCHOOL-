import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { setExamActive } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Activate an exam. Admin only, audited. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await setExamActive(db, ctx, (await params).id, true));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
