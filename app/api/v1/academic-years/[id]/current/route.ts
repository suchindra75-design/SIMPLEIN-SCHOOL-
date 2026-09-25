import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { setCurrentAcademicYear } from "@/lib/services/years";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Switch the school's current academic year. Admin only. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await setCurrentAcademicYear(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
