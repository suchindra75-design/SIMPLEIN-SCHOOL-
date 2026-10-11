import { School, Persona } from "../types";

export const initialSchool: School = {
  id: "sch-01",
  name: "SIMPLEIN International School",
  academicYear: "2026–2027",
  currentTerm: "Term 1 (Autumn)",
  address: "42 Academic Boulevard, West Campus, CA",
  principalName: "Dr. Robert Vance, Ph.D.",
};

export const demoPersonas: Persona[] = [
  {
    id: "persona-admin",
    role: "admin",
    name: "Dr. Robert Vance",
    title: "Principal & Head of School",
    avatarText: "RV",
  },
  {
    id: "persona-teacher",
    role: "teacher",
    name: "Sarah Jenkins",
    title: "Class Teacher (Grade 5-A) & Head of Science",
    avatarText: "SJ",
    teacherId: "tea-05",
  },
  {
    id: "persona-parent",
    role: "parent",
    name: "David Miller",
    title: "Parent (Lucas & Sophia Miller)",
    avatarText: "DM",
    parentId: "par-01",
  },
  {
    id: "persona-student",
    role: "student",
    name: "Lucas Miller",
    title: "Student (Grade 5-A • Roll 5A-01)",
    avatarText: "LM",
    studentId: "stu-sec-5a-01",
  },
];
