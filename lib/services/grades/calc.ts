/**
 * Grading engine (pure, unit-tested, ONE home — see docs/ARCHITECTURE.md §21).
 * Percentage-based bands, configurable per school; CGPA-extensible via
 * grade_point. No letter grades are hard-coded anywhere — schools define
 * their own rules (e.g. 90–100 → A+).
 */

export interface GradingRule {
  minPercentage: number;
  maxPercentage: number;
  grade: string;
  gradePoint: number | null;
}

export interface GradeResult {
  grade: string | null;
  gradePoint: number | null;
}

/** Rejects an invalid band set (pure). Returns an error message or null. */
export function validateGradingRules(
  rules: readonly {
    minPercentage: number;
    maxPercentage: number;
    grade: string;
    gradePoint?: number | null;
  }[],
): string | null {
  if (rules.length === 0) return "At least one grading rule is required";
  const grades = new Set<string>();
  for (const r of rules) {
    if (r.grade.trim() === "") return "Every rule needs a grade label";
    if (r.minPercentage < 0 || r.maxPercentage > 100) {
      return "Bands must stay within 0–100";
    }
    if (r.maxPercentage < r.minPercentage) {
      return `Band ${r.grade}: max must be >= min`;
    }
    if (grades.has(r.grade)) {
      return `Duplicate grade label ${r.grade}`;
    }
    grades.add(r.grade);
  }
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (
        a !== undefined &&
        b !== undefined &&
        a.minPercentage < b.maxPercentage &&
        a.maxPercentage > b.minPercentage
      ) {
        return `Bands ${a.grade} and ${b.grade} overlap`;
      }
    }
  }
  return null;
}

/**
 * Resolve the grade for a percentage: first rule whose band contains it
 * (min <= p <= max). Rules with equal boundaries resolve to the HIGHER band
 * first (e.g. 90 with 80–90 and 90–100 → 90–100). No match → null.
 */
export function gradeFor(
  percentage: number,
  rules: readonly GradingRule[],
): GradeResult {
  const sorted = [...rules].sort(
    (a, b) => b.minPercentage - a.minPercentage,
  );
  for (const r of sorted) {
    if (percentage >= r.minPercentage && percentage <= r.maxPercentage) {
      return { grade: r.grade, gradePoint: r.gradePoint ?? null };
    }
  }
  return { grade: null, gradePoint: null };
}
