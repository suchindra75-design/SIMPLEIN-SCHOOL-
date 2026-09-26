import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { setMarksLocked } from "@/lib/services/marks";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Unlock marks (re-enables edits). Admin only, audited. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await setMarksLocked(db, ctx, (await params).id, false));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
