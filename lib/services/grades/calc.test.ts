import { describe, expect, it } from "vitest";
import {
  gradeFor,
  validateGradingRules,
  type GradingRule,
} from "@/lib/services/grades/calc";

const rules: GradingRule[] = [
  { minPercentage: 90, maxPercentage: 100, grade: "A+", gradePoint: 10 },
  { minPercentage: 80, maxPercentage: 89.99, grade: "A", gradePoint: 9 },
  { minPercentage: 0, maxPercentage: 79.99, grade: "D", gradePoint: 4 },
];

describe("grade boundary calculations", () => {
  it("resolves boundary percentages to the higher band", () => {
    expect(gradeFor(90, rules).grade).toBe("A+");
    expect(gradeFor(89.99, rules).grade).toBe("A");
    expect(gradeFor(80, rules).grade).toBe("A");
    expect(gradeFor(79.99, rules).grade).toBe("D");
  });

  it("resolves extremes", () => {
    expect(gradeFor(100, rules)).toEqual({ grade: "A+", gradePoint: 10 });
    expect(gradeFor(0, rules).grade).toBe("D");
  });

  it("returns null for out-of-range percentages", () => {
    expect(gradeFor(100.01, rules).grade).toBeNull();
    expect(gradeFor(-1, rules).grade).toBeNull();
  });

  it("returns null with no rules (no fake grades)", () => {
    expect(gradeFor(85, []).grade).toBeNull();
  });
});

describe("validateGradingRules", () => {
  it("accepts clean non-overlapping bands", () => {
    expect(validateGradingRules(rules)).toBeNull();
  });

  it("rejects overlapping bands, duplicates, and invalid ranges", () => {
    expect(
      validateGradingRules([
        { minPercentage: 80, maxPercentage: 90, grade: "A", gradePoint: null },
        { minPercentage: 85, maxPercentage: 95, grade: "B", gradePoint: null },
      ]),
    ).toMatch(/overlap/);
    expect(
      validateGradingRules([
        { minPercentage: 0, maxPercentage: 50, grade: "X", gradePoint: null },
        { minPercentage: 50, maxPercentage: 100, grade: "X", gradePoint: null },
      ]),
    ).toMatch(/Duplicate grade/);
    expect(
      validateGradingRules([
        { minPercentage: 60, maxPercentage: 50, grade: "X", gradePoint: null },
      ]),
    ).toMatch(/max must be >= min/);
    expect(
      validateGradingRules([
        { minPercentage: -5, maxPercentage: 50, grade: "X", gradePoint: null },
      ]),
    ).toMatch(/0–100/);
    expect(validateGradingRules([])).toMatch(/At least one/);
  });
});
