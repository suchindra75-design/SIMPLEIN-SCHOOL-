import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * True when the Supabase env is present. Used to fail closed (treat as
 * anonymous) in environments without credentials, e.g. a bare `next build`.
 */
export function isSupabaseConfigured(): boolean {
  return (
    process.env["NEXT_PUBLIC_SUPABASE_URL"] !== undefined &&
    process.env["NEXT_PUBLIC_SUPABASE_URL"] !== "" &&
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] !== undefined &&
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] !== ""
  );
}

/**
 * Server-side Supabase client bound to request cookies.
 * All data access goes through this so RLS sees the caller's JWT.
 */
export async function createServerSupabaseClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (url === undefined || anonKey === undefined) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ): void {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as { path?: string });
          }
        } catch {
          // Called from a Server Component where cookie mutation is not
          // allowed — middleware.ts refreshes the session instead.
        }
      },
    },
  });
}
