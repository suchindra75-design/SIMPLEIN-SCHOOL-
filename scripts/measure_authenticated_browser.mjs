import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.argv[2] || "https://simplein-school-demo-lu05tscvy-dev-b73d.vercel.app";
const SAMPLES_PER_ROUTE = 5;
// Preview deployments are protected by Vercel Authentication, so the bypass
// secret is required alongside a dedicated test account for each role.
const REQUIRED_ENV = [
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "MEASURE_ADMIN_LOGIN",
  "MEASURE_ADMIN_PASSWORD",
  "MEASURE_TEACHER_LOGIN",
  "MEASURE_TEACHER_PASSWORD",
  "MEASURE_PARENT_LOGIN",
  "MEASURE_PARENT_PASSWORD",
  "MEASURE_STUDENT_LOGIN",
  "MEASURE_STUDENT_PASSWORD",
];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  console.error("Example: node --env-file=.env.local scripts/measure_authenticated_browser.mjs <base-url>");
  process.exit(1);
}

const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const ROLES_CONFIG = [
  {
    role: "SCHOOL_ADMIN",
    tabLabel: "Admin",
    identifier: process.env.MEASURE_ADMIN_LOGIN,
    password: process.env.MEASURE_ADMIN_PASSWORD,
    routes: [
      "/admin",
      "/admin/students",
      "/admin/classes",
      "/admin/fees",
      "/admin/notices",
    ]
  },
  {
    role: "TEACHER",
    tabLabel: "Teacher",
    identifier: process.env.MEASURE_TEACHER_LOGIN,
    password: process.env.MEASURE_TEACHER_PASSWORD,
    routes: [
      "/teacher",
      "/teacher/attendance",
      "/teacher/homework",
      "/teacher/marks",
    ]
  },
  {
    role: "PARENT",
    tabLabel: "Parent",
    identifier: process.env.MEASURE_PARENT_LOGIN,
    password: process.env.MEASURE_PARENT_PASSWORD,
    routes: [
      "/parent",
      "/parent/attendance",
      "/parent/fees",
    ]
  },
  {
    role: "STUDENT",
    tabLabel: "Student",
    identifier: process.env.MEASURE_STUDENT_LOGIN,
    password: process.env.MEASURE_STUDENT_PASSWORD,
    routes: [
      "/student",
      "/student/attendance",
      "/student/results",
      "/student/fees",
      "/student/pyqs",
    ]
  }
];

function calcStats(arr) {
  if (!arr || arr.length === 0) return { min: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return { min, median, p95, max };
}

async function main() {
  console.log(`\n==================================================`);
  console.log(`REAL AUTHENTICATED BROWSER PERFORMANCE BENCHMARK`);
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Samples per route: ${SAMPLES_PER_ROUTE}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`==================================================\n`);

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const config of ROLES_CONFIG) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Logging in as ${config.role} (${config.identifier})...`);
    console.log(`--------------------------------------------------`);

    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-vercel-protection-bypass": BYPASS_SECRET
      }
    });
    const page = await context.newPage();

    // Perform UI Login
    const response = await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    console.log(`Login page HTTP status: ${response ? response.status() : "N/A"}, title: "${await page.title()}"`);

    // Check if Vercel deployment protection page was hit
    if (page.url().includes("vercel.com") || (await page.title()).includes("Deployment Protection")) {
      console.log("Vercel deployment protection active. Bypass page...");
    }

    // Wait for form input
    await page.waitForSelector('input[name="identifier"], input[type="email"], input[type="text"]', { timeout: 15000 });

    // Click role tab button (e.g. Admin, Teacher, Parent, Student)
    const tabBtn = page.getByRole("button", { name: config.tabLabel, exact: true });
    if (await tabBtn.count() > 0) {
      await tabBtn.click();
    }
    
    await page.locator('input[name="identifier"]').fill(config.identifier);
    await page.locator('input[name="password"]').fill(config.password);

    await Promise.all([
      page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15000 }),
      page.locator('button[type="submit"]').click(),
    ]);

    console.log(`Logged in successfully! Current URL: ${page.url()}`);

    for (const route of config.routes) {
      console.log(`\nMeasuring route: [${config.role}] ${route}...`);
      const routeSamples = [];
      let headersInfo = {};

      for (let s = 0; s < SAMPLES_PER_ROUTE; s++) {
        let mainResponseHeaders = {};
        const responseHandler = (res) => {
          const u = res.url();
          if (u === `${BASE_URL}${route}` || u === `${BASE_URL}${route}/`) {
            mainResponseHeaders = res.headers();
          }
        };
        page.on("response", responseHandler);

        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        page.off("response", responseHandler);

        // Extract Navigation Timing API metrics from inside the browser
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          if (!nav) return null;
          return {
            startTime: Math.round(nav.startTime),
            responseStart: Math.round(nav.responseStart - nav.startTime),
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            loadEventEnd: Math.round(nav.loadEventEnd - nav.startTime),
            duration: Math.round(nav.duration)
          };
        });

        if (metrics) {
          const effectiveTotal = metrics.duration || metrics.loadEventEnd || metrics.domContentLoaded;
          routeSamples.push({
            ttfb: metrics.responseStart,
            domContent: metrics.domContentLoaded,
            totalDuration: effectiveTotal,
          });
          console.log(`  Sample ${s + 1}: TTFB=${metrics.responseStart}ms | DOM=${metrics.domContentLoaded}ms | Total=${effectiveTotal}ms`);
        }

        if (s === 0) {
          headersInfo = {
            cacheControl: mainResponseHeaders["cache-control"] || "N/A",
            xVercelCache: mainResponseHeaders["x-vercel-cache"] || "N/A",
            xVercelId: mainResponseHeaders["x-vercel-id"] || "N/A",
          };
        }

        await new Promise(r => setTimeout(r, 200));
      }

      const ttfbStats = calcStats(routeSamples.map(r => r.ttfb));
      const domStats = calcStats(routeSamples.map(r => r.domContent));
      const totalStats = calcStats(routeSamples.map(r => r.totalDuration));

      const routeResult = {
        role: config.role,
        route,
        samplesCount: routeSamples.length,
        ttfb: ttfbStats,
        domContent: domStats,
        totalDuration: totalStats,
        headers: headersInfo
      };

      allResults.push(routeResult);

      console.log(`\nSUMMARY for ${route}:`);
      console.log(`  TTFB (ms)         : Min=${ttfbStats.min} | Median=${ttfbStats.median} | P95=${ttfbStats.p95} | Max=${ttfbStats.max}`);
      console.log(`  DOM Content (ms)  : Min=${domStats.min} | Median=${domStats.median} | P95=${domStats.p95} | Max=${domStats.max}`);
      console.log(`  Total Time (ms)   : Min=${totalStats.min} | Median=${totalStats.median} | P95=${totalStats.p95} | Max=${totalStats.max}`);
      console.log(`  Headers           : Cache-Control: ${headersInfo.cacheControl} | X-Vercel-Cache: ${headersInfo.xVercelCache} | X-Vercel-ID: ${headersInfo.xVercelId}`);
    }

    await context.close();
  }

  await browser.close();

  const outputPath = fileURLToPath(new URL("../scratch/vercel_preview_optimized_benchmark.json", import.meta.url));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`Results saved to: ${outputPath}`);

  console.log(`\n==================================================`);
  console.log(`ALL AUTHENTICATED BENCHMARKS COMPLETE`);
  console.log(`Results written to scratch/real_authenticated_benchmark.json`);
  console.log(`==================================================\n`);
}

main().catch(console.error);
