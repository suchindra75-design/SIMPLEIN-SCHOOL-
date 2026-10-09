/**
 * LATENCY MEASUREMENT SCRIPT
 * Measures DNS, Connection Time, TTFB, Total Duration, and query counts.
 */
import http from "http";
import https from "https";
import { performance } from "perf_hooks";
import { createClient } from "/Users/apple/SIMPLEIN-SCHOOL-/node_modules/@supabase/supabase-js/dist/index.mjs";

const SUPABASE_URL = "https://krzbajfioftoubcbyeso.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyemJhamZpb2Z0b3ViY2J5ZXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzczNzIsImV4cCI6MjEwNjA1MzM3Mn0.oLsq7EzVyyxRRcwGHxt1QIOdMpU2Rs8EXjJo0LUqa-Q";

async function measureUrl(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    const dnsStart = performance.now();
    let dnsEnd = dnsStart;
    let connectEnd = dnsStart;
    let ttfb = dnsStart;
    let end = dnsStart;

    const req = lib.request(urlStr, { method: "GET", headers }, (res) => {
      ttfb = performance.now();
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        end = performance.now();
        resolve({
          url: urlStr,
          status: res.statusCode,
          dnsTime: Math.max(0, dnsEnd - dnsStart),
          connectTime: Math.max(0, connectEnd - dnsEnd),
          ttfb: Math.max(0, ttfb - dnsStart),
          totalTime: Math.max(0, end - dnsStart),
          bodyLength: body.length
        });
      });
    });

    req.on("socket", (socket) => {
      socket.on("lookup", () => { dnsEnd = performance.now(); });
      socket.on("connect", () => { connectEnd = performance.now(); });
      socket.on("secureConnect", () => { connectEnd = performance.now(); });
    });

    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function anonSignIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  return data?.session;
}

function formatCookies(session) {
  if (!session) return "";
  const ref = "krzbajfioftoubcbyeso";
  const s = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  if (s.length <= 3000) return `sb-${ref}-auth-token=${s}`;
  const chunks = [];
  for (let i = 0, off = 0; off < s.length; off += 3000, i++)
    chunks.push(`sb-${ref}-auth-token.${i}=${s.slice(off, off + 3000)}`);
  return chunks.join("; ");
}

async function main() {
  const baseUrl = process.argv[2] || "http://localhost:3010";
  console.log(`Measuring latency against ${baseUrl}...\n`);

  // Measure direct roundtrip to Supabase Seoul
  console.log("=== DIRECT SUPABASE RTT (ap-northeast-2) ===");
  for (let i = 0; i < 3; i++) {
    const sb = await measureUrl(`${SUPABASE_URL}/rest/v1/`, { apikey: ANON_KEY });
    console.log(`Sample ${i+1}: TTFB=${sb.ttfb.toFixed(1)}ms, Total=${sb.totalTime.toFixed(1)}ms`);
  }

  // Get sessions
  console.log("\nLogging in demo users to get cookies...");
  const adminSession   = await anonSignIn("admin@greenfield-demo.edu", "Demo@1dce23a79c11!2026");
  const teacherSession = await anonSignIn("teacher.math@greenfield-demo.edu", "Demo@ae1450b0ce06!2026");
  const parentSession  = await anonSignIn("parent.sharma@greenfield-demo.edu", "Demo@56fa2671f39f!2026");
  const studentSession = await anonSignIn("student.aarav@greenfield-demo.edu", "Demo@b6ba92cf23e7!2026");

  const routes = [
    { name: "Unauth /api/v1/health", path: "/api/v1/health", cookie: "" },
    { name: "Unauth /login", path: "/login", cookie: "" },

    { name: "Admin Dashboard", path: "/admin", cookie: formatCookies(adminSession) },
    { name: "Admin Students", path: "/admin/students", cookie: formatCookies(adminSession) },
    { name: "Admin Classes", path: "/admin/classes", cookie: formatCookies(adminSession) },
    { name: "Admin Attendance", path: "/admin/attendance", cookie: formatCookies(adminSession) },
    { name: "Admin Exams", path: "/admin/exams", cookie: formatCookies(adminSession) },
    { name: "Admin Marks", path: "/admin/marks", cookie: formatCookies(adminSession) },
    { name: "Admin Fees", path: "/admin/fees", cookie: formatCookies(adminSession) },

    { name: "Teacher Dashboard", path: "/teacher", cookie: formatCookies(teacherSession) },
    { name: "Teacher Attendance", path: "/teacher/attendance", cookie: formatCookies(teacherSession) },
    { name: "Teacher Marks", path: "/teacher/marks", cookie: formatCookies(teacherSession) },
    { name: "Teacher Homework", path: "/teacher/homework", cookie: formatCookies(teacherSession) },

    { name: "Parent Dashboard", path: "/parent", cookie: formatCookies(parentSession) },
    { name: "Parent Attendance", path: "/parent/attendance", cookie: formatCookies(parentSession) },
    { name: "Parent Results", path: "/parent/results", cookie: formatCookies(parentSession) },
    { name: "Parent Fees", path: "/parent/fees", cookie: formatCookies(parentSession) },

    { name: "Student Dashboard", path: "/student", cookie: formatCookies(studentSession) },
    { name: "Student Results", path: "/student/results", cookie: formatCookies(studentSession) },
    { name: "Student Report Cards", path: "/student/report-cards", cookie: formatCookies(studentSession) },
    { name: "Student Homework", path: "/student/homework", cookie: formatCookies(studentSession) },
    { name: "Student Fees", path: "/student/fees", cookie: formatCookies(studentSession) },
    { name: "Student PYQs", path: "/student/pyqs", cookie: formatCookies(studentSession) },
  ];

  console.log("\n=== ROUTE LATENCY MEASUREMENTS (3 SAMPLES PER ROUTE) ===");
  console.log("Route".padEnd(25) + "Status".padEnd(8) + "TTFB (ms)".padEnd(12) + "Total (ms)".padEnd(12) + "Samples (TTFB ms)");
  console.log("-".repeat(70));

  const summary = [];

  for (const r of routes) {
    const samples = [];
    let status = 0;
    for (let i = 0; i < 3; i++) {
      try {
        const m = await measureUrl(`${baseUrl}${r.path}`, r.cookie ? { cookie: r.cookie } : {});
        status = m.status;
        samples.push(m.ttfb);
      } catch (e) {
        samples.push(-1);
      }
    }
    const valid = samples.filter(s => s >= 0);
    const avgTtfb = valid.length ? (valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(1) : "ERR";
    const sampleStr = samples.map(s => s.toFixed(0)).join(", ");

    console.log(r.name.padEnd(25) + String(status).padEnd(8) + String(avgTtfb).padEnd(12) + sampleStr);
    summary.push({ name: r.name, path: r.path, status, avgTtfb: Number(avgTtfb), samples });
  }

  return summary;
}

main().catch(console.error);
