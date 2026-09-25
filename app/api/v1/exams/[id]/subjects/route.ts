import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { addExamSubject } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { examSubjectSchema } from "@/lib/validation/exams";

export const dynamic = "force-dynamic";

/** Add a subject config (marks + schedule) to an exam. Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = examSubjectSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await addExamSubject(db, ctx, (await params).id, input), undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
