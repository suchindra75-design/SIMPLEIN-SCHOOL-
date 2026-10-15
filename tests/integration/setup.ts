/**
 * Integration tests run against a LOCAL Supabase only:
 *   npx supabase start
 *   node scripts/seed-local.mjs            (with LOCAL_SUPABASE_* set, see docs/LOCAL_DEMO.md)
 *   LOCAL_SUPABASE_ANON_KEY=… LOCAL_SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
 * The app code reads NEXT_PUBLIC_SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY, so this
 * points those at the local instance for the test process.
 */
const url = process.env["LOCAL_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const { hostname } = new URL(url);
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  throw new Error(`Integration tests only run against a local Supabase, not ${hostname}.`);
}
const anon = process.env["LOCAL_SUPABASE_ANON_KEY"];
const service = process.env["LOCAL_SUPABASE_SERVICE_ROLE_KEY"];
if (!anon || !service) {
  throw new Error(
    "Set LOCAL_SUPABASE_ANON_KEY and LOCAL_SUPABASE_SERVICE_ROLE_KEY (local keys from `npx supabase status`).",
  );
}
process.env["NEXT_PUBLIC_SUPABASE_URL"] = url;
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = anon;
process.env["SUPABASE_SERVICE_ROLE_KEY"] = service;
