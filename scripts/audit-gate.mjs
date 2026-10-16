#!/usr/bin/env node
/**
 * CI gate for `npm audit --omit=dev --json` (production dependencies only).
 *
 *   npm audit --omit=dev --json > audit.json || true
 *   node scripts/audit-gate.mjs audit.json
 *
 * Fails (exit 1) on:
 *   - any CRITICAL advisory;
 *   - any HIGH advisory that is not listed in ACCEPTED below for that package;
 *   - an ACCEPTED entry past its review date (forces a fresh decision);
 *   - a report that is not a valid npm audit v2 report (e.g. the registry
 *     could not be reached) — the gate fails closed.
 * Moderate/low advisories are printed but do not fail the build.
 * Prints package names, severities and advisory ids only.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Known HIGH advisories accepted for now; see docs/PRODUCTION_READINESS.md §4. */
export const ACCEPTED = [
  {
    package: "xlsx",
    ids: ["GHSA-4r6h-8v6p-xvw6", "GHSA-5pgg-2g8v-p4x9"],
    reason: "Admin-only student import behind the content/size gate (lib/uploads/spreadsheet.ts); no fixed version on npm. Replace with SheetJS 0.20.3 or a CSV-only importer.",
    reviewBy: "2026-11-30",
  },
  {
    package: "postcss",
    ids: ["GHSA-qx2v-qp2m-jg93", "GHSA-6g55-p6wh-862q", "GHSA-fxqj-rqcc-2cmp", "GHSA-r28c-9q8g-f849"],
    reason: "Build-time only (pinned by next), processes first-party CSS; fixed by a Next.js upgrade.",
    reviewBy: "2026-11-30",
  },
  {
    package: "sharp",
    ids: ["GHSA-wq5f-xc86-pv6w"],
    reason: "Not used at runtime (no next/image); resolved by the next 15.5.28 upgrade.",
    reviewBy: "2026-11-30",
  },
  {
    package: "source-map-js",
    ids: ["GHSA-68fv-2mgg-jv7q"],
    reason: "Build-time only; `npm update source-map-js` (1.2.2) pending approval.",
    reviewBy: "2026-11-30",
  },
];

const advisoryId = (url) => (typeof url === "string" ? (url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/) ?? [null])[0] : null);

/**
 * @param {unknown} report parsed `npm audit --json` output
 * @param {typeof ACCEPTED} accepted
 * @param {string} today YYYY-MM-DD
 * @returns {{ ok: boolean, failures: string[], notes: string[] }}
 */
export function evaluateAudit(report, accepted = ACCEPTED, today = new Date().toISOString().slice(0, 10)) {
  const failures = [];
  const notes = [];
  if (report === null || typeof report !== "object" || report.auditReportVersion !== 2 || typeof report.vulnerabilities !== "object") {
    return { ok: false, failures: ["Not a valid npm audit v2 report (audit did not run?)"], notes };
  }
  for (const entry of accepted) {
    if (entry.reviewBy < today) failures.push(`Accepted advisories for ${entry.package} are past their review date (${entry.reviewBy})`);
  }
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
    for (const via of Array.isArray(vuln?.via) ? vuln.via : []) {
      if (via === null || typeof via !== "object") continue; // "depends on <pkg>": reported under that package
      const id = advisoryId(via.url) ?? String(via.source ?? "unknown");
      const severity = String(via.severity ?? vuln.severity ?? "unknown");
      const line = `${severity.toUpperCase()} ${pkg} ${id}`;
      if (severity === "critical") failures.push(line);
      else if (severity === "high") {
        const ok = accepted.some((a) => a.package === pkg && a.ids.includes(id));
        (ok ? notes : failures).push(ok ? `${line} (accepted)` : line);
      } else notes.push(line);
    }
  }
  return { ok: failures.length === 0, failures, notes };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report = null;
  try {
    report = JSON.parse(readFileSync(process.argv[2] ?? 0, "utf8"));
  } catch {
    report = null;
  }
  const { ok, failures, notes } = evaluateAudit(report);
  for (const n of notes) console.log(`note  ${n}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(ok ? "Dependency audit gate passed." : "Dependency audit gate failed.");
  process.exit(ok ? 0 : 1);
}
