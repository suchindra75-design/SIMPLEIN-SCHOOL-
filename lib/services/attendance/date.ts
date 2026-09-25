/**
 * Attendance date handling (docs/ARCHITECTURE.md §19):
 * - Dates are SCHOOL-LOCAL calendar dates. `todayInSchoolTz()` derives
 *   "today" from the school's configured timezone (public.schools.timezone),
 *   never from the server's own local timezone.
 * - The UI defaults the date picker to `todayInSchoolTz()` (server-computed).
 * - The server validates the client-supplied YYYY-MM-DD string: well-formed,
 *   not before MIN_DATE, and at most FUTURE_TOLERANCE_DAYS ahead of the
 *   school's today (allows minor device-clock skew, blocks real future marks).
 */

export const MIN_ATTENDANCE_DATE = "2000-01-01";
export const FUTURE_TOLERANCE_DAYS = 1;

/** Today's date in the given IANA timezone as YYYY-MM-DD (falls back to UTC). */
export function todayInSchoolTz(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns an error message, or null when the date is acceptable. Pure. */
export function validateAttendanceDate(
  date: string,
  opts: { today: string; minDate?: string; futureToleranceDays?: number } = {
    today: todayInSchoolTz("UTC"),
  },
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "Date must be YYYY-MM-DD";
  }
  const min = opts.minDate ?? MIN_ATTENDANCE_DATE;
  if (date < min) {
    return "Date is too far in the past";
  }
  const max = addDays(opts.today, opts.futureToleranceDays ?? FUTURE_TOLERANCE_DAYS);
  if (date > max) {
    return "Attendance cannot be marked for a future date";
  }
  return null;
}
