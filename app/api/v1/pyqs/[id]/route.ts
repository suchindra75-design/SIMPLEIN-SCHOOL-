import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { setPyqActive, updatePyq } from "@/lib/services/pyqs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pyqUpdateSchema } from "@/lib/validation/pyqs";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Edit PYQ metadata. Admin only, audited. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = pyqUpdateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await updatePyq(db, ctx, (await params).id, patch));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Archive/restore a PYQ (soft-delete). Admin only, audited. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { active } = z
      .object({ active: z.coerce.boolean() })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = await createServerSupabaseClient();
    return ok(await setPyqActive(db, ctx, (await params).id, active));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
