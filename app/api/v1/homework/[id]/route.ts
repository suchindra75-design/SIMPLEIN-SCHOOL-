import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  deleteHomework,
  getHomework,
  updateHomework,
} from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { homeworkUpdateSchema } from "@/lib/validation/homework";

export const dynamic = "force-dynamic";

/** Scoped homework detail with attachments. 404 unless authorized. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getHomework(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Edit homework. Author-teacher or admin, audited. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = homeworkUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updateHomework(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Soft-delete homework (history preserved). Author-teacher or admin, audited. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await deleteHomework(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
