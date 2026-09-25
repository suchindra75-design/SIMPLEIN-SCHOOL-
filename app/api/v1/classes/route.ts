import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createClass, listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classCreateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listClasses(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = classCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createClass(db, ctx, { name: input.name, orderIndex: input.orderIndex }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
