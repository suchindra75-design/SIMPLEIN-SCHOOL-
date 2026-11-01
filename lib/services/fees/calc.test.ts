import { describe, expect, it } from "vitest";
import { aggregateStudentDues, feeBalance, type BalanceRecord } from "./calc";

const verified = (amount: number): BalanceRecord => ({ amount, isVoided: false, verified: true });
const unverified = (amount: number): BalanceRecord => ({ amount, isVoided: false, verified: false });

describe("feeBalance (sanity for the roll-up)", () => {
  it("counts only verified, non-voided payments toward paid", () => {
    const b = feeBalance(1000, [verified(400), unverified(600), { amount: 100, isVoided: true, verified: true }]);
    expect(b.paid).toBe(400);
    expect(b.due).toBe(600);
    expect(b.status).toBe("PARTIAL");
  });
});

describe("aggregateStudentDues", () => {
  const today = "2026-11-01";

  it("sums dues across a student's assignments and counts only those with a balance", () => {
    const out = aggregateStudentDues(
      [
        { studentId: "s1", totalAmount: 1000, dueDate: null, records: [verified(400)] }, // due 600
        { studentId: "s1", totalAmount: 500, dueDate: null, records: [verified(500)] }, // paid → excluded
        { studentId: "s1", totalAmount: 300, dueDate: null, records: [] }, // due 300
      ],
      today,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ studentId: "s1", totalDue: 900, feeCount: 2, overdue: false, overdueDue: 0 });
  });

  it("omits students with no outstanding balance", () => {
    const out = aggregateStudentDues(
      [{ studentId: "s2", totalAmount: 1000, dueDate: null, records: [verified(1000)] }],
      today,
    );
    expect(out).toHaveLength(0);
  });

  it("flags overdue and tracks the overdue portion", () => {
    const out = aggregateStudentDues(
      [
        { studentId: "s3", totalAmount: 1000, dueDate: "2026-10-01", records: [] }, // overdue, due 1000
        { studentId: "s3", totalAmount: 500, dueDate: "2026-12-31", records: [] }, // not yet due, due 500
      ],
      today,
    );
    expect(out[0]).toMatchObject({ studentId: "s3", totalDue: 1500, overdueDue: 1000, overdue: true, feeCount: 2 });
  });

  it("keeps students separate", () => {
    const out = aggregateStudentDues(
      [
        { studentId: "a", totalAmount: 100, dueDate: null, records: [] },
        { studentId: "b", totalAmount: 200, dueDate: null, records: [] },
      ],
      today,
    );
    expect(out.map((d) => [d.studentId, d.totalDue]).sort()).toEqual([
      ["a", 100],
      ["b", 200],
    ]);
  });
});
