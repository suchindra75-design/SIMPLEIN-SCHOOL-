#!/usr/bin/env node
/**
 * LOCAL-ONLY smoke crawl for the four portals.
 *
 * Signs in as each seeded demo role (scripts/seed-local.mjs) and requests every
 * page route with that session:
 *   - own-portal pages must return 200 (or redirect within the portal) without
 *     an error screen;
 *   - other portals' home pages must redirect away (role protection);
 *   - /notifications must render for every role.
 * Prints status and server response time per route; exits 1 on any failure.
 *
 * Usage (app running locally against the local Supabase):
 *   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_SUPABASE_ANON_KEY=<local anon key> \
 *   APP_URL=http://localhost:3999 node scripts/smoke-crawl.mjs
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./local-demo.mjs";

const supabaseUrl = process.env["LOCAL_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const anonKey = process.env["LOCAL_SUPABASE_ANON_KEY"];
const appUrl = process.env["APP_URL"] ?? "http://localhost:3999";
for (const u of [supabaseUrl, appUrl]) {
  const { hostname } = new URL(u);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    console.error(`Refusing to crawl ${hostname}: local only.`);
    process.exit(1);
  }
}
if (!anonKey) {
  console.error("Set LOCAL_SUPABASE_ANON_KEY (local key from `npx supabase status`).");
  process.exit(1);
}

const appDir = join(fileURLToPath(new URL("..", import.meta.url)), "app");
const ERROR_MARKERS = /We couldn(&#x27;|')t load this page|Application error|This page could not be found|Unhandled Runtime Error/;

/** Session cookies exactly as the app's middleware expects them. */
async function signIn(email) {
  const jar = new Map();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

function pageRoutes(portal) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") out.push("/" + relative(appDir, dir).split(sep).join("/"));
    }
  };
  walk(join(appDir, portal));
  return out.sort();
}

async function get(path, cookie) {
  const t0 = performance.now();
  const res = await fetch(appUrl + path, { headers: { cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    ms: Math.round(performance.now() - t0),
    errorScreen: ERROR_MARKERS.test(body),
  };
}

// Detail-page ids, read through the admin's own (RLS-scoped) session.
const admin = await signIn(DEMO_ACCOUNTS.admin.email);
const first = async (table, col = "id") => {
  const { data, error } = await admin.client.from(table).select(col).limit(1).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data[col];
};
const ids = {
  classes: await first("classes"),
  exams: await first("exams"),
  parents: await first("parents"),
  students: await first("students"),
  teachers: await first("teachers"),
};
const fillIds = (route) => route.replace(/\/(\w+)\/\[id\]/, (_, coll) => `/${coll}/${ids[coll]}`);

const portals = { admin: "admin", teacher: "teacher", parent: "parent", student: "student" };
let failures = 0;
const rows = [];

for (const [role, portal] of Object.entries(portals)) {
  const { cookie } = role === "admin" ? admin : await signIn(DEMO_ACCOUNTS[role].email);
  for (const route of [...pageRoutes(portal).map(fillIds), "/notifications"]) {
    const r = await get(route, cookie);
    const redirectWithin = r.status >= 300 && r.status < 400 && /^\/(admin|teacher|parent|student|notifications)/.test(new URL(r.location, appUrl).pathname) && (new URL(r.location, appUrl).pathname.startsWith(`/${portal}`) || new URL(r.location, appUrl).pathname.startsWith("/notifications"));
    const ok = (r.status === 200 && !r.errorScreen) || redirectWithin;
    if (!ok) failures++;
    rows.push(`${ok ? "ok  " : "FAIL"} ${role.padEnd(7)} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(5)}ms ${route.replace(/[0-9a-f-]{36}/, "[id]")}${r.errorScreen ? "  (error screen)" : ""}${r.location ? `  -> ${new URL(r.location, appUrl).pathname}` : ""}`);
  }
  for (const other of Object.values(portals).filter((p) => p !== portal)) {
    const r = await get(`/${other}`, cookie);
    const ok = r.status >= 300 && r.status < 400 && !new URL(r.location, appUrl).pathname.startsWith(`/${other}`);
    if (!ok) failures++;
    rows.push(`${ok ? "ok  " : "FAIL"} ${role.padEnd(7)} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(5)}ms /${other} (must be blocked)${r.location ? `  -> ${new URL(r.location, appUrl).pathname}` : ""}`);
  }
}

console.log(rows.join("\n"));
console.log(`\n${rows.length} checks, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
