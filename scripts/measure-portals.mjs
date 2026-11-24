#!/usr/bin/env node
/**
 * Times every portal page for each role against a running deployment
 * (local `next start`, a Vercel preview, or production) with real logins.
 *
 * Signs in through @supabase/ssr (the same session cookies the app uses),
 * requests each page server-side, and prints the median time per page and
 * per portal. Also prints the session token's signing algorithm: ES256/RS256
 * means the middleware verifies logins locally (fast); HS256 means the
 * project still uses the legacy shared JWT secret and every request makes an
 * extra round trip to Supabase Auth (see docs/HOSTED_PERFORMANCE_CHECK.md).
 *
 * Usage:
 *   node --env-file=.env.local scripts/measure-portals.mjs <base-url> [samples]
 * Env (use dedicated test accounts, never real users):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   MEASURE_{ADMIN,TEACHER,PARENT,STUDENT}_LOGIN   (email)
 *   MEASURE_{ADMIN,TEACHER,PARENT,STUDENT}_PASSWORD
 *   VERCEL_AUTOMATION_BYPASS_SECRET  (only for protected Preview deployments)
 * Writes measure-portals-<timestamp>.json in the current directory.
 */
import fs from "node:fs";
import { createServerClient } from "@supabase/ssr";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const SAMPLES = Number(process.argv[3] ?? 5);
const env = process.env;
const PAGES = {
  ADMIN: ["/admin", "/admin/students", "/admin/teachers", "/admin/classes", "/admin/attendance", "/admin/exams", "/admin/marks", "/admin/report-cards", "/admin/timetable", "/admin/homework", "/admin/notices", "/admin/fees", "/admin/promotions"],
  TEACHER: ["/teacher", "/teacher/attendance", "/teacher/homework", "/teacher/timetable", "/teacher/marks", "/teacher/exams", "/teacher/report-cards", "/teacher/notices"],
  PARENT: ["/parent", "/parent/attendance", "/parent/results", "/parent/fees", "/parent/homework", "/parent/timetable", "/parent/exams", "/parent/report-cards", "/parent/notices"],
  STUDENT: ["/student", "/student/timetable", "/student/attendance", "/student/homework", "/student/exams", "/student/results", "/student/report-cards", "/student/fees", "/student/notices"],
};

const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter((n) => !env[n]);
if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

async function signIn(email, password) {
  const jar = new Map();
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const t0 = performance.now();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  const loginMs = Math.round(performance.now() - t0);
  if (error) throw new Error(`${email}: ${error.message}`);
  const header = JSON.parse(Buffer.from(data.session.access_token.split(".")[0], "base64url").toString());
  return { cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; "), alg: header.alg, loginMs };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const headersFor = (cookie) => {
  const h = { cookie };
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) h["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return h;
};

const results = [];
console.log(`Base URL: ${BASE} · ${SAMPLES} samples per page\n`);
for (const [role, pages] of Object.entries(PAGES)) {
  const login = env[`MEASURE_${role}_LOGIN`];
  const password = env[`MEASURE_${role}_PASSWORD`];
  if (!login || !password) {
    console.log(`${role}: skipped (set MEASURE_${role}_LOGIN / _PASSWORD)`);
    continue;
  }
  const session = await signIn(login, password);
  console.log(`${role}: signed in in ${session.loginMs} ms · token signed with ${session.alg}${session.alg === "HS256" ? " (legacy secret: login checks go to Supabase Auth on every request)" : ""}`);
  for (const page of pages) {
    await fetch(BASE + page, { headers: headersFor(session.cookie), redirect: "manual" }).then((r) => r.text());
    const times = [];
    let status = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const res = await fetch(BASE + page, { headers: headersFor(session.cookie), redirect: "manual" });
      await res.text();
      times.push(Math.round(performance.now() - t0));
      status = res.status;
    }
    results.push({ role, page, status, medianMs: median(times), minMs: Math.min(...times) });
    console.log(`  ${page.padEnd(26)} ${status}  ${String(median(times)).padStart(5)} ms`);
  }
}
console.log("\nAverage per portal (median page time):");
for (const role of Object.keys(PAGES)) {
  const rows = results.filter((r) => r.role === role);
  if (rows.length > 0) {
    console.log(`  ${role.padEnd(8)} ${Math.round(rows.reduce((s, r) => s + r.medianMs, 0) / rows.length)} ms over ${rows.length} pages`);
  }
}
const file = `measure-portals-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(file, JSON.stringify({ base: BASE, samples: SAMPLES, results }, null, 2));
console.log(`\nSaved ${file}`);
