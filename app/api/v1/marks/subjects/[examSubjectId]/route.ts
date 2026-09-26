import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getMarksGrid } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Marks entry grid: roster + existing marks + subject state (scoped). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examSubjectId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getMarksGrid(db, ctx, (await params).examSubjectId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
