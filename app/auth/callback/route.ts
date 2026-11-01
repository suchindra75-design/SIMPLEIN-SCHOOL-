import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateSafeRedirect } from "@/lib/auth/portal";

/**
 * Supabase recovery/confirmation callback. The emailed link lands here with a
 * one-time `code`; we exchange it for a session (cookies set on the response),
 * then forward the user to `next` (default: the set-new-password screen).
 *
 * Only same-origin relative paths are allowed as `next` (open-redirect safe).
 * Any failure routes back to /login rather than leaking details.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = validateSafeRedirect(url.searchParams.get("next"), "/reset-password");

  if (code === null || code === "") {
    return NextResponse.redirect(new URL("/login?error=invalid", url.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error !== null) {
    return NextResponse.redirect(new URL("/login?error=invalid", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
