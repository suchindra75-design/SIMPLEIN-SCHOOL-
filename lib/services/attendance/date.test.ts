import { describe, expect, it } from "vitest";
import {
  todayInSchoolTz,
  validateAttendanceDate,
} from "@/lib/services/attendance/date";

describe("todayInSchoolTz", () => {
  it("derives today from the school timezone, not the server clock zone", () => {
    // 2026-09-25 20:30 UTC = 2026-09-26 02:00 in Asia/Kolkata (+5:30).
    const utcEvening = new Date("2026-09-25T20:30:00Z");
    expect(todayInSchoolTz("Asia/Kolkata", utcEvening)).toBe("2026-09-26");
    expect(todayInSchoolTz("UTC", utcEvening)).toBe("2026-09-25");
    // New York is behind: 2026-09-25 20:30 UTC = 16:30 same day.
    expect(todayInSchoolTz("America/New_York", utcEvening)).toBe("2026-09-25");
  });

  it("falls back to UTC for an invalid timezone", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    expect(todayInSchoolTz("Not/AZone", now)).toBe("2026-09-25");
  });
});

describe("validateAttendanceDate", () => {
  const today = "2026-09-25";

  it("accepts today, yesterday, and one day of future tolerance", () => {
    expect(validateAttendanceDate("2026-09-25", { today })).toBeNull();
    expect(validateAttendanceDate("2026-09-24", { today })).toBeNull();
    expect(validateAttendanceDate("2026-09-26", { today })).toBeNull();
  });

  it("rejects future dates beyond tolerance", () => {
    expect(validateAttendanceDate("2026-09-27", { today })).toMatch(/future/);
    expect(validateAttendanceDate("2027-01-01", { today })).toMatch(/future/);
  });

  it("rejects malformed and far-past dates", () => {
    expect(validateAttendanceDate("25-09-2026", { today })).toMatch(/YYYY-MM-DD/);
    expect(validateAttendanceDate("not-a-date", { today })).toMatch(/YYYY-MM-DD/);
    expect(validateAttendanceDate("1999-12-31", { today })).toMatch(/past/);
  });

  it("respects a custom tolerance", () => {
    expect(
      validateAttendanceDate("2026-09-28", { today, futureToleranceDays: 3 }),
    ).toBeNull();
  });
});
