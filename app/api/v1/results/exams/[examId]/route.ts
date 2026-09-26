import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getMarksGrid } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({ subjectId: z.string().uuid() });

/** Marks review grid for an exam subject (admin/authorized teacher). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { subjectId } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    return ok(await getMarksGrid(db, ctx, subjectId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
