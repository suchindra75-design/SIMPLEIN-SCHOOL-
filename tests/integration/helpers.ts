import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adaptSupabase, getCurrentUser, type SessionContext } from "@/lib/auth/session";
import type { DbClient } from "@/lib/services/errors";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../../scripts/local-demo.mjs";

export { DEMO_ACCOUNTS, DUPLICATE_IDENTIFIERS } from "../../scripts/local-demo.mjs";

const url = () => process.env["NEXT_PUBLIC_SUPABASE_URL"] as string;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } } as const;

/** Service-role client for fixtures and assertions (local instance only). */
export function serviceClient(): SupabaseClient {
  return createClient(url(), process.env["SUPABASE_SERVICE_ROLE_KEY"] as string, noSession);
}

export interface Actor {
  db: DbClient;
  ctx: SessionContext;
}

/** Sign in as a seeded demo account; returns its RLS-bound client and session context. */
export async function signIn(email: string): Promise<Actor> {
  const client = createClient(url(), process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] as string, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error !== null) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  const ctx = await getCurrentUser(adaptSupabase(client as never));
  if (ctx === null) throw new Error(`no app profile for ${email}`);
  return { db: client as unknown as DbClient, ctx };
}

export type DemoRole = keyof typeof DEMO_ACCOUNTS;
export const as = (role: DemoRole) => signIn(DEMO_ACCOUNTS[role].email);

/** Look up seeded rows by natural keys (service role, assertions only). */
export async function studentByAdmission(admissionNo: string, schoolSlug = "greenfield-demo") {
  const db = serviceClient();
  const { data: school } = await db.from("schools").select("id").eq("slug", schoolSlug).single();
  const { data, error } = await db
    .from("students")
    .select("id, section_id, class_id, school_id, display_name")
    .eq("school_id", school!.id)
    .eq("admission_no", admissionNo)
    .single();
  if (error !== null) throw new Error(`student ${admissionNo}: ${error.message}`);
  return data as { id: string; section_id: string; class_id: string; school_id: string; display_name: string };
}

export async function schoolId(slug: string): Promise<string> {
  const { data, error } = await serviceClient().from("schools").select("id").eq("slug", slug).single();
  if (error !== null) throw new Error(`school ${slug}: ${error.message}`);
  return (data as { id: string }).id;
}

/** Run `fn` and return the thrown error's constructor name (or "none"). */
export async function errorName(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "none";
  } catch (error) {
    return error instanceof Error ? error.constructor.name : typeof error;
  }
}
