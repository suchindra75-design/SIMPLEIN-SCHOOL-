/**
 * Safe staging env check.
 * Usage: npm run check:env
 *
 * Presence-only: prints variable NAMES with OK/MISSING status.
 * NEVER prints secret values. Exit 1 when a required var is missing.
 */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ONBOARDING_SECRET",
];
const OPTIONAL = ["NEXT_PUBLIC_APP_URL"];

let missing = 0;
for (const name of REQUIRED) {
  const set = process.env[name] !== undefined && process.env[name] !== "";
  if (!set) missing += 1;
  console.log(`${set ? "OK     " : "MISSING"}  ${name} (required)`);
}
for (const name of OPTIONAL) {
  const set = process.env[name] !== undefined && process.env[name] !== "";
  console.log(`${set ? "OK     " : "MISSING"}  ${name} (optional)`);
}
if (missing > 0) {
  console.log(
    `\n${missing} required variable(s) missing. Copy .env.example to .env.local and fill values from the Supabase dashboard. Never commit real values.`,
  );
  process.exit(1);
} else {
  console.log("\nAll required env names are set (values not shown).");
}
