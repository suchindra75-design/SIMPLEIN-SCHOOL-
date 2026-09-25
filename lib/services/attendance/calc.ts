import type { AttendanceStatus } from "@/lib/validation/attendance";

/**
 * ONE consistent attendance percentage rule (docs/ARCHITECTURE.md §19):
 * - PRESENT counts fully toward attendance.
 * - ABSENT counts against attendance.
 * - LEAVE is an EXCUSED absence: it is excluded from the denominator entirely
 *   (a student on approved leave is neither present nor penalised).
 * percentage = present / (present + absent) * 100, rounded to 2 decimals.
 * When there are no counted days (denominator 0), percentage is null —
 * "not enough data", never a fake 100%.
 */
export interface StatusCounts {
  present: number;
  absent: number;
  leave: number;
  total: number;
}

export interface AttendanceSummary extends StatusCounts {
  percentage: number | null;
}

export function countStatuses(
  statuses: readonly AttendanceStatus[],
): StatusCounts {
  let present = 0;
  let absent = 0;
  let leave = 0;
  for (const s of statuses) {
    if (s === "PRESENT") present += 1;
    else if (s === "ABSENT") absent += 1;
    else leave += 1;
  }
  return { present, absent, leave, total: statuses.length };
}

export function attendancePercentage(
  present: number,
  absent: number,
): number | null {
  const denominator = present + absent;
  if (denominator === 0) return null;
  return Math.round((present / denominator) * 10000) / 100;
}

/** Student/section summary over any set of statuses. */
export function summarize(
  statuses: readonly AttendanceStatus[],
): AttendanceSummary {
  const counts = countStatuses(statuses);
  return { ...counts, percentage: attendancePercentage(counts.present, counts.absent) };
}

/** Section daily summary from per-student statuses. */
export function summarizeSectionDay(
  statuses: readonly AttendanceStatus[],
): AttendanceSummary & { totalStudents: number } {
  const s = summarize(statuses);
  return { ...s, totalStudents: s.total };
}
