import { AttendanceRecord, AttendanceStatus } from "../types";
import { initialStudents } from "./students-parents";

// Generate 25 recent school days (skipping weekends) leading up to 2026-09-30
function getRecentSchoolDays(count: number): string[] {
  const days: string[] = [];
  const current = new Date("2026-09-30T12:00:00Z");

  while (days.length < count) {
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Monday - Friday
      const iso = current.toISOString().split("T")[0];
      days.unshift(iso);
    }
    current.setUTCDate(current.getUTCDate() - 1);
  }

  return days;
}

export function generateAttendanceRecords(): AttendanceRecord[] {
  const dates = getRecentSchoolDays(25);
  const records: AttendanceRecord[] = [];

  for (const student of initialStudents) {
    // Generate pseudo-random deterministic attendance history based on student id
    const seed = student.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

    for (let dayIdx = 0; dayIdx < dates.length; dayIdx++) {
      const date = dates[dayIdx];
      const roll = (seed * 13 + dayIdx * 37) % 100;
      
      let status: AttendanceStatus = "PRESENT";
      let remarks: string | undefined = undefined;

      if (roll < 4) {
        status = "ABSENT";
        remarks = roll % 2 === 0 ? "Unexcused absence" : "Parent reported illness";
      } else if (roll < 7) {
        status = "LATE";
        remarks = "Arrived 15 mins late (transit delay)";
      } else if (roll < 9) {
        status = "EXCUSED";
        remarks = "Medical appointment notice received";
      } else {
        status = "PRESENT";
      }

      records.push({
        id: `att-${student.id}-${date}`,
        studentId: student.id,
        sectionId: student.sectionId,
        date,
        status,
        remarks,
      });
    }
  }

  return records;
}

export const initialAttendance = generateAttendanceRecords();
