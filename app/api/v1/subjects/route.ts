import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createSubject, listSubjects } from "@/lib/services/subjects";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { subjectCreateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listSubjects(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = subjectCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createSubject(db, ctx, {
        name: input.name,
        code: input.code,
        orderIndex: input.orderIndex,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
