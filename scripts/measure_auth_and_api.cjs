const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://krzbajfioftoubcbyeso.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyemJhamZpb2Z0b3ViY2J5ZXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzczNzIsImV4cCI6MjEwNjA1MzM3Mn0.oLsq7EzVyyxRRcwGHxt1QIOdMpU2Rs8EXjJo0LUqa-Q";

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
      email: "admin@greenfield-demo.edu",
      password: "Demo@1dce23a79c11!2026"
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
    email: "admin@greenfield-demo.edu",
    password: "Demo@1dce23a79c11!2026"
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
