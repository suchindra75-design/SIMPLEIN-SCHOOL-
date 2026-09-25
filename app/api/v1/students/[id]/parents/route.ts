import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { linkChild } from "@/lib/services/parents";
import { getStudent } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { studentParentLinkSchema } from "@/lib/validation/people";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = studentParentLinkSchema.extend({
  parentId: z.string().uuid(),
});

/** Parents linked to a student. Scoped read; admin-only link creation. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    const { parents } = await getStudent(db, ctx, (await params).id);
    return ok(parents);
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
    const input = bodySchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await linkChild(db, ctx, input.parentId, (await params).id, input),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
