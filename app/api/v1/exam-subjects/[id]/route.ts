import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  removeExamSubject,
  updateExamSubject,
} from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { examSubjectUpdateSchema } from "@/lib/validation/exams";

export const dynamic = "force-dynamic";

/** Update a subject's exam config. Admin only, re-validated, audited. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = examSubjectUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateExamSubject(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Remove a subject from the exam. Admin only, audited. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await removeExamSubject(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
