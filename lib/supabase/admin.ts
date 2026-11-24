import { createClient } from "@supabase/supabase-js";

/**
 * SERVICE-ROLE BOUNDARY (see docs/ARCHITECTURE.md §4.1).
 *
 * - The browser and all ordinary request handlers use the authenticated
 *   user-context clients (lib/supabase/client.ts, lib/supabase/server.ts).
 *   RLS applies to everything they do.
 * - This admin client bypasses RLS. It is SERVER-ONLY and reserved for
 *   trusted operations: school onboarding, user/role provisioning, and
 *   settling gateway-confirmed fee payments (lib/services/online-payments.ts,
 *   only via the settle_fee_payment_order / note_fee_payment_order_failure
 *   functions, only after the gateway has proven the capture).
 * - It must NEVER be imported by client components, NEVER be used as a
 *   convenience for ordinary authenticated CRUD, and NEVER reach the
 *   browser bundle (the getter throws outside a server runtime and when
 *   the key is absent).
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Service-role client must never run in the browser");
  }
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (url === undefined || url === "") {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (serviceKey === undefined || serviceKey === "") {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
