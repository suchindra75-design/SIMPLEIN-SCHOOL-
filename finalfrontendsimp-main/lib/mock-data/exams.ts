import { Exam, MarkRecord } from "../types";
import { initialStudents } from "./students-parents";
import { calculateGrade } from "../domain";

export const initialExams: Exam[] = [
  {
    id: "exam-01",
    title: "Diagnostic Term Assessment",
    term: "Term 1 (Autumn)",
    startDate: "2026-09-08",
    endDate: "2026-09-15",
    status: "PUBLISHED",
    applicableClassIds: ["cls-1", "cls-2", "cls-3", "cls-4", "cls-5", "cls-6", "cls-7", "cls-8"],
    maxMarksPerSubject: 100,
    subjects: ["Mathematics", "English Language", "General Science", "Social Studies"],
    publishedAt: "2026-09-20T10:00:00Z",
  },
  {
    id: "exam-02",
    title: "Mid-Term Examination 2026",
    term: "Term 1 (Autumn)",
    startDate: "2026-09-22",
    endDate: "2026-09-28",
    status: "SUBMITTED",
    applicableClassIds: ["cls-1", "cls-2", "cls-3", "cls-4", "cls-5", "cls-6", "cls-7", "cls-8"],
    maxMarksPerSubject: 100,
    subjects: ["Mathematics", "English Language", "General Science", "Social Studies"],
  },
  {
    id: "exam-03",
    title: "Final Term Assessment 2026",
    term: "Term 1 (Autumn)",
    startDate: "2026-11-15",
    endDate: "2026-11-25",
    status: "DRAFT",
    applicableClassIds: ["cls-1", "cls-2", "cls-3", "cls-4", "cls-5", "cls-6", "cls-7", "cls-8"],
    maxMarksPerSubject: 100,
    subjects: ["Mathematics", "English Language", "General Science", "Social Studies", "Art"],
  },
];

export function generateMarkRecords(): MarkRecord[] {
  const marks: MarkRecord[] = [];
  const examsToGrade = [
    { examId: "exam-01", subjects: ["Mathematics", "English Language", "General Science", "Social Studies"] },
    { examId: "exam-02", subjects: ["Mathematics", "English Language", "General Science", "Social Studies"] },
  ];

  for (const { examId, subjects } of examsToGrade) {
    for (const student of initialStudents) {
      const seed = student.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      
      subjects.forEach((subj, sIdx) => {
        // Deterministic realistic mark between 58 and 98
        const base = 65 + ((seed * 17 + sIdx * 29 + (examId === "exam-01" ? 11 : 23)) % 32);
        const marksObtained = Math.min(100, Math.max(50, base));
        const { grade, label } = calculateGrade(marksObtained, 100);

        marks.push({
          id: `mrk-${examId}-${student.id}-${subj.toLowerCase().replace(/\s+/g, "-")}`,
          examId,
          studentId: student.id,
          subject: subj,
          marksObtained,
          maxMarks: 100,
          grade,
          remarks: marksObtained >= 85 ? "Excellent performance" : label,
        });
      });
    }
  }

  return marks;
}

export const initialMarks = generateMarkRecords();
