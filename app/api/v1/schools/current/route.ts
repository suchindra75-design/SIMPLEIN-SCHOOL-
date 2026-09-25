import { authErrorResponse } from "@/lib/api/auth-errors";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";

/** Session-aware — never statically prerendered. */
export const dynamic = "force-dynamic";

/** The caller's own school. Tenant scope comes from the session. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ school: ctx.school });
  } catch (error) {
    return authErrorResponse(error);
  }
}
