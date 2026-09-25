import { describe, expect, it } from "vitest";
import {
  attendancePercentage,
  countStatuses,
  summarize,
  summarizeSectionDay,
} from "@/lib/services/attendance/calc";

describe("attendance percentage rule", () => {
  it("PRESENT counts fully; ABSENT counts against", () => {
    expect(attendancePercentage(8, 2)).toBe(80);
    expect(attendancePercentage(10, 0)).toBe(100);
    expect(attendancePercentage(0, 10)).toBe(0);
  });

  it("LEAVE is excused — excluded from the denominator", () => {
    // 17 present, 1 absent, 2 leave → 17/(17+1) = 94.44% (leave ignored)
    expect(attendancePercentage(17, 1)).toBe(94.44);
    const summary = summarize(["PRESENT", "ABSENT", "LEAVE", "LEAVE"]);
    expect(summary).toEqual({
      present: 1,
      absent: 1,
      leave: 2,
      total: 4,
      percentage: 50,
    });
  });

  it("zero counted days → null (never a fake 100%)", () => {
    expect(attendancePercentage(0, 0)).toBeNull();
    expect(summarize(["LEAVE", "LEAVE"]).percentage).toBeNull();
    expect(summarize([]).percentage).toBeNull();
  });

  it("rounds to 2 decimals", () => {
    expect(attendancePercentage(2, 1)).toBe(66.67);
    expect(attendancePercentage(1, 2)).toBe(33.33);
  });

  it("counts statuses and section day totals", () => {
    const counts = countStatuses(["PRESENT", "PRESENT", "ABSENT", "LEAVE"]);
    expect(counts).toEqual({ present: 2, absent: 1, leave: 1, total: 4 });
    const day = summarizeSectionDay(["PRESENT", "ABSENT", "LEAVE"]);
    expect(day.totalStudents).toBe(3);
    expect(day.percentage).toBe(50);
  });
});
