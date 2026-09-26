import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getStudentResult } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({ examId: z.string().uuid() });

/**
 * Student result for an exam (subject marks, totals, percentage, grade).
 * Parents: PUBLISHED results only (404 when unpublished / unlinked).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { examId } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    return ok(
      await getStudentResult(db, ctx, (await params).studentId, examId),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
