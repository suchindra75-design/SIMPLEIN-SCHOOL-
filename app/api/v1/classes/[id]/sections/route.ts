import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createSection, listSections } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sectionCreateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listSections(db, ctx, (await params).id));
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
    const input = sectionCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createSection(db, ctx, (await params).id, {
        name: input.name,
        orderIndex: input.orderIndex,
        classTeacherId: input.classTeacherId,
        room: input.room,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
