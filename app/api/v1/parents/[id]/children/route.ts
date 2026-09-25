import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { linkChild, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { studentParentLinkSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

const linkBodySchema = studentParentLinkSchema.extend({
  studentId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listChildren(db, ctx, (await params).id));
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
    const input = linkBodySchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await linkChild(db, ctx, (await params).id, input.studentId, input),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
