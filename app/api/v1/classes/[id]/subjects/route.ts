import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  linkSubjectToClass,
  listClassSubjects,
  unlinkSubjectFromClass,
} from "@/lib/services/subjects";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classSubjectLinkSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listClassSubjects(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const { subjectId } = classSubjectLinkSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await linkSubjectToClass(db, ctx, (await params).id, subjectId),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

const deleteQuerySchema = z.object({ subjectId: z.string().uuid() });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { subjectId } = deleteQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    return ok(await unlinkSubjectFromClass(db, ctx, (await params).id, subjectId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
