import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  deleteNotice,
  getNotice,
  updateNotice,
} from "@/lib/services/notices";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(5000).optional(),
  category: z
    .enum(["GENERAL", "CLASS", "SECTION", "EXAM", "HOLIDAY", "URGENT"])
    .optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  audience: z
    .object({
      type: z.enum(["SCHOOL", "CLASS", "SECTION", "TEACHERS", "PARENTS"]),
      classId: z.string().uuid().nullish(),
      sectionId: z.string().uuid().nullish(),
    })
    .optional(),
});

/** In-audience single notice. 404 outside audience/cross-tenant. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await getNotice(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Edit notice/targets. Admin only, audited. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const patch = patchSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await updateNotice(db, ctx, (await params).id, {
        title: patch.title,
        content: patch.content,
        category: patch.category,
        expiresAt: patch.expiresAt,
        audience: patch.audience,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Archive (soft-delete). Admin only, audited. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await deleteNotice(db, ctx, (await params).id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
