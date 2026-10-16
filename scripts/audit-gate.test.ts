import { describe, expect, it } from "vitest";
import { ACCEPTED, evaluateAudit } from "./audit-gate.mjs";

const advisory = (pkg: string, id: string, severity: string) => ({
  source: 1,
  name: pkg,
  dependency: pkg,
  title: "t",
  url: `https://github.com/advisories/${id}`,
  severity,
  range: "*",
});
const report = (vulns: Record<string, { severity: string; via: unknown[] }>) => ({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(Object.entries(vulns).map(([name, v]) => [name, { name, ...v }])),
  metadata: {},
});

// The production report as of 12 Oct 2026 (npm audit --omit=dev).
const current = report({
  next: { severity: "moderate", via: [advisory("next", "GHSA-4jqv-mc3x-m676", "moderate"), advisory("next", "GHSA-mcj8-r9mp-w47p", "moderate"), "postcss"] },
  postcss: { severity: "high", via: ["GHSA-qx2v-qp2m-jg93", "GHSA-6g55-p6wh-862q", "GHSA-fxqj-rqcc-2cmp", "GHSA-r28c-9q8g-f849"].map((id) => advisory("postcss", id, "high")) },
  sharp: { severity: "high", via: [advisory("sharp", "GHSA-wq5f-xc86-pv6w", "high")] },
  "source-map-js": { severity: "high", via: [advisory("source-map-js", "GHSA-68fv-2mgg-jv7q", "high")] },
  xlsx: { severity: "high", via: [advisory("xlsx", "GHSA-4r6h-8v6p-xvw6", "high"), advisory("xlsx", "GHSA-5pgg-2g8v-p4x9", "high")] },
});

describe("production dependency audit gate (CI)", () => {
  it("passes the known, documented advisories and reports them", () => {
    const result = evaluateAudit(current, ACCEPTED, "2026-10-16");
    expect(result.ok).toBe(true);
    expect(result.notes).toContain("HIGH xlsx GHSA-4r6h-8v6p-xvw6 (accepted)");
    expect(result.notes).toContain("MODERATE next GHSA-4jqv-mc3x-m676");
  });

  it("fails on a new high advisory, even in an already-listed package", () => {
    const next = structuredClone(current);
    next.vulnerabilities.xlsx!.via.push(advisory("xlsx", "GHSA-aaaa-bbbb-cccc", "high"));
    next.vulnerabilities.zod = { name: "zod", severity: "high", via: [advisory("zod", "GHSA-dddd-eeee-ffff", "high")] };
    const result = evaluateAudit(next, ACCEPTED, "2026-10-16");
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["HIGH xlsx GHSA-aaaa-bbbb-cccc", "HIGH zod GHSA-dddd-eeee-ffff"]);
  });

  it("fails on any critical advisory (no acceptance possible)", () => {
    const result = evaluateAudit(report({ xlsx: { severity: "critical", via: [advisory("xlsx", "GHSA-4r6h-8v6p-xvw6", "critical")] } }), ACCEPTED, "2026-10-16");
    expect(result.ok).toBe(false);
  });

  it("fails once an acceptance is past its review date", () => {
    expect(evaluateAudit(current, ACCEPTED, "2027-01-01").ok).toBe(false);
  });

  it("fails closed when the audit did not produce a report", () => {
    expect(evaluateAudit({ error: { code: "ENOTFOUND" } }).ok).toBe(false);
    expect(evaluateAudit(null).ok).toBe(false);
  });
});
