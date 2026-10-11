import { AttendanceRecord, Exam, Notice, Role } from "../types";

export function calculateGrade(marksObtained: number, maxMarks: number): {
  grade: string;
  points: number;
  label: string;
} {
  if (maxMarks <= 0) return { grade: "N/A", points: 0, label: "Invalid" };
  const percentage = (marksObtained / maxMarks) * 100;

  if (percentage >= 90) return { grade: "A+", points: 4.0, label: "Outstanding" };
  if (percentage >= 80) return { grade: "A", points: 3.7, label: "Excellent" };
  if (percentage >= 70) return { grade: "B", points: 3.0, label: "Very Good" };
  if (percentage >= 60) return { grade: "C", points: 2.0, label: "Good" };
  if (percentage >= 50) return { grade: "D", points: 1.0, label: "Pass" };
  return { grade: "F", points: 0.0, label: "Needs Improvement" };
}

export function calculateAttendancePercentage(records: AttendanceRecord[]): number {
  if (!records || records.length === 0) return 100;
  
  let score = 0;
  for (const r of records) {
    if (r.status === "PRESENT" || r.status === "EXCUSED") {
      score += 1;
    } else if (r.status === "LATE") {
      score += 0.5;
    }
  }
  return Math.round((score / records.length) * 1000) / 10;
}

export function filterNoticesForRole(notices: Notice[], role: Role): Notice[] {
  return notices.filter((n) => {
    if (n.audience === "ALL") return true;
    if (role === "admin") return true;
    if (role === "teacher" && n.audience === "TEACHER") return true;
    if (role === "parent" && n.audience === "PARENT") return true;
    return false;
  });
}

export function isExamPublished(exam: Exam): boolean {
  return exam.status === "PUBLISHED";
}

export function formatFriendlyDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}
