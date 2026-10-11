export type Role = "admin" | "teacher" | "parent" | "student";

export interface Persona {
  id: string;
  role: Role;
  name: string;
  title: string;
  avatarText: string;
  teacherId?: string;
  parentId?: string;
  studentId?: string;
}

export interface School {
  id: string;
  name: string;
  academicYear: string;
  currentTerm: string;
  address: string;
  principalName: string;
}

export interface GradeClass {
  id: string;
  name: string;
  numericLevel: number;
}

export interface Section {
  id: string;
  classId: string;
  className: string;
  name: string;
  fullName: string;
  roomNumber: string;
  classTeacherId: string;
  capacity: number;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string[];
  assignedSectionIds: string[];
  joinDate: string;
}

export interface Parent {
  id: string;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  childrenStudentIds: string[];
}

export interface Student {
  id: string;
  rollNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: "Male" | "Female";
  dob: string;
  sectionId: string;
  className: string;
  sectionName: string;
  parentId: string;
  parentName: string;
  parentPhone: string;
  status: "Active" | "Inactive";
  enrollmentDate: string;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceRecord {
  id: string;
  studentId: string;
  sectionId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  remarks?: string;
}

export type ExamLifecycle = "DRAFT" | "SUBMITTED" | "PUBLISHED";

export interface Exam {
  id: string;
  title: string;
  term: string;
  startDate: string;
  endDate: string;
  status: ExamLifecycle;
  applicableClassIds: string[];
  maxMarksPerSubject: number;
  subjects: string[];
  publishedAt?: string;
}

export interface MarkRecord {
  id: string;
  examId: string;
  studentId: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
  remarks?: string;
}

export interface Homework {
  id: string;
  sectionId: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  assignedDate: string;
  teacherId: string;
  teacherName: string;
  submissionCount: number;
  totalStudents: number;
}

export type NoticeAudience = "ALL" | "TEACHER" | "PARENT";

export interface Notice {
  id: string;
  title: string;
  content: string;
  audience: NoticeAudience;
  publishedDate: string;
  authorName: string;
  isUrgent: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  targetRole: Role | "ALL";
  type: "attendance" | "exam" | "notice" | "system";
}
