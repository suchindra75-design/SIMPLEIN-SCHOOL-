import { authErrorResponse } from "@/lib/api/auth-errors";
import { ok } from "@/lib/api/response";
import { getCurrentUser, AuthError } from "@/lib/auth/session";

/** Session-aware — never statically prerendered. */
export const dynamic = "force-dynamic";

/** Current auth + tenant context for the UI shell and role routing. */
export async function GET() {
  try {
    const ctx = await getCurrentUser();
    if (ctx === null) {
      return authErrorResponse(new AuthError());
    }
    return ok({
      authUserId: ctx.authUserId,
      profile: ctx.profile,
      school: ctx.school,
      roles: ctx.roles,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
