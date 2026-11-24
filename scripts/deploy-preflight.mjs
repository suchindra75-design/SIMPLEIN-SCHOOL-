#!/usr/bin/env node
/**
 * Pre-deploy readiness gate for SIMPLEIN SCHOOL ERP.
 *
 *   npm run preflight
 *
 * Runs the same hard gates CI runs, in order, stopping at the first failure:
 *   1. typecheck (tsc --noEmit)
 *   2. unit tests (vitest run)
 *   3. production dependency audit gate (no critical; highs must be accepted)
 *   4. production build (next build)
 *
 * Environment is reported (names only, never values) but does NOT fail the
 * gate: production secrets live in Vercel/host env, not in the local checkout.
 * A green run means the CODE is ready to deploy; the owner still completes the
 * account steps in docs/DEPLOY_RUNBOOK.md (keys, Mumbai Supabase, Vercel env).
 *
 * Never prints secret values.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// Mirror lib/config/env.ts (names only — kept in sync by scripts/check-env.mjs).
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ONBOARDING_SECRET",
];

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore; env is informational here
  }
}

const steps = [
  { name: "typecheck", cmd: "npm run -s typecheck" },
  { name: "unit tests", cmd: "npm test --silent" },
  {
    name: "dependency audit gate",
    // `npm audit` exits non-zero when advisories exist; the gate decides pass/fail.
    cmd: "npm audit --omit=dev --json > .preflight-audit.json 2>/dev/null || true; node scripts/audit-gate.mjs .preflight-audit.json; code=$?; rm -f .preflight-audit.json; exit $code",
  },
  { name: "production build", cmd: "npm run -s build" },
];

function run(step) {
  process.stdout.write(`\n▶ ${step.name}\n`);
  try {
    execSync(step.cmd, { stdio: "inherit", shell: "/bin/bash" });
    return true;
  } catch {
    return false;
  }
}

console.log("SIMPLEIN SCHOOL ERP — deploy preflight\n");
const missing = REQUIRED.filter((n) => process.env[n] === undefined || process.env[n] === "");
console.log(
  missing.length === 0
    ? "env: all required names present locally (values not shown)"
    : `env: missing locally: ${missing.join(", ")}\n     (OK — production env is set in Vercel, not in this checkout)`,
);

for (const step of steps) {
  if (!run(step)) {
    console.error(`\n✗ FAILED at: ${step.name}. Fix it before deploying.`);
    process.exit(1);
  }
}

console.log(
  "\n✓ Preflight passed. The CODE is deploy-ready.\n" +
    "  Next: complete the owner steps in docs/DEPLOY_RUNBOOK.md, then deploy.\n",
);
