import { authErrorResponse } from "@/lib/api/auth-errors";
import { ok } from "@/lib/api/response";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Server-safe logout: clears the session cookies. */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    return ok({ loggedOut: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
