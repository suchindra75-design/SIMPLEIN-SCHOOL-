import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getSectionSummary } from "@/lib/services/attendance";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { attendanceDateQuerySchema } from "@/lib/validation/attendance";

export const dynamic = "force-dynamic";

/** One-date section summary (server-side aggregation). Admin/teacher. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { date } = attendanceDateQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    return ok(
      await getSectionSummary(db, ctx, (await params).sectionId, date),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
