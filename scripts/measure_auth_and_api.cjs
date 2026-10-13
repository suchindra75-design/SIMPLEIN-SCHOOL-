const { createClient } = require("@supabase/supabase-js");

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "MEASURE_ADMIN_LOGIN",
  "MEASURE_ADMIN_PASSWORD",
];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  console.error(
    "Use a dedicated test account (MEASURE_ADMIN_LOGIN must be an email). Example: node --env-file=.env.local scripts/measure_auth_and_api.cjs",
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.MEASURE_ADMIN_LOGIN;
const ADMIN_PASSWORD = process.env.MEASURE_ADMIN_PASSWORD;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function calcStats(arr) {
  if (arr.length === 0) return { min: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return { min, median, p95, max };
}

async function benchmarkAuthLogin() {
  const times = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    const elapsed = Math.round(performance.now() - start);
    if (error) {
      console.error("Auth error:", error.message);
    } else {
      times.push(elapsed);
    }
    await supabase.auth.signOut();
    await new Promise(r => setTimeout(r, 100));
  }
  return calcStats(times);
}

async function benchmarkAuthenticatedQuery() {
  const { data: authData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });

  if (loginErr) {
    console.error("Login failed for query bench:", loginErr.message);
    return { min: 0, median: 0, p95: 0, max: 0 };
  }

  const times = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const { data, error } = await supabase.from("students").select("id, first_name, last_name, admission_no").limit(10);
    const elapsed = Math.round(performance.now() - start);
    if (!error) {
      times.push(elapsed);
    } else {
      console.error("Query error:", error.message);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  await supabase.auth.signOut();
  return calcStats(times);
}

async function main() {
  console.log("\n==================================================");
  console.log("DIRECT AUTH & STAGING SUPABASE RLS BENCHMARKS (10 Iterations)");
  console.log("Target Supabase Region: ap-northeast-2 (Seoul)");
  console.log("==================================================\n");

  console.log("Measuring Supabase Auth Login Latency (10 samples)...");
  const authStats = await benchmarkAuthLogin();
  console.log("Auth Login Latency (ms):", authStats);

  console.log("\nMeasuring Authenticated Student RLS Query Latency (10 samples)...");
  const queryStats = await benchmarkAuthenticatedQuery();
  console.log("Authenticated RLS Query Latency (ms):", queryStats);
}

main();
