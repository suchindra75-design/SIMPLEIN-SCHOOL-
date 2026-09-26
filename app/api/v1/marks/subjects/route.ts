import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { listMarkableSubjects } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({ examId: z.string().uuid() });

/** Markable exam subjects for the caller (admin → all; teacher → authorized). */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { examId } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    return ok(await listMarkableSubjects(db, ctx, examId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
