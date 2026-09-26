import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { getPyqFileUrl } from "@/lib/services/pyqs";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Short-lived signed URL for a PYQ file (question/solution/answerKey).
 * Same-school read scope; archived PYQs → 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { kind } = z
      .object({
        kind: z
          .enum(["question", "solution", "answerKey"])
          .default("question"),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = await createServerSupabaseClient();
    return ok({
      url: await getPyqFileUrl(db, ctx, (await params).id, kind),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
