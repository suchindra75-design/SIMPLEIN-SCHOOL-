/**
 * Service DTOs (camelCase). Every service returns these — never raw
 * PostgREST fragments — so API routes and pages share one typed contract.
 * To-one joins are objects (matching PostgREST runtime shapes).
 */

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  userRoles: { role: string }[];
}

export interface TeacherDto {
  id: string;
  schoolId: string;
  userId: string | null;
  employeeNo: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  qualification: string | null;
  dateOfJoining: string | null;
  photoPath: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ParentDto {
  id: string;
  schoolId: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SectionDto {
  id: string;
  name: string;
  orderIndex: number;
  room: string | null;
  isActive: boolean;
  classTeacherId: string | null;
  classId?: string;
  classes?: { name: string } | null;
  teachers?: { displayName: string } | null;
}

export interface ClassDto {
  id: string;
  name: string;
  orderIndex: number;
  isActive: boolean;
  sections?: SectionDto[];
}

export interface SubjectDto {
  id: string;
  name: string;
  code: string | null;
  orderIndex: number;
  isActive: boolean;
}

export interface ClassSubjectDto {
  id: string;
  subjectId: string;
  subjects: { id: string; name: string; code: string | null; isActive: boolean };
}

export interface AssignmentDto {
  id: string;
  subjectId: string;
  sectionId: string;
  academicYearId: string | null;
  subjects: { name: string };
  sections: { name: string };
}

export interface StudentDto {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  dob: string | null;
  gender: string | null;
  photoPath: string | null;
  address: string | null;
  guardianPhone: string | null;
  admissionDate: string | null;
  classId: string | null;
  sectionId: string | null;
  rollNumber: string | null;
  status: string;
  createdAt: string;
  classes?: { name: string } | null;
  sections?: { name: string } | null;
}

export interface LinkedParentDto {
  parentId: string;
  relation: string;
  isPrimary: boolean;
  parents: { id: string; fullName: string; phone: string | null };
}

export interface ChildDto extends StudentDto {
  link: { studentId: string; relation: string; isPrimary: boolean };
}

export interface AcademicYearDto {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface ExamSubjectDto {
  id: string;
  examId: string;
  subjectId: string;
  maxMarks: number;
  passingMarks: number;
  examDate: string | null;
  startTime: string | null;
  endTime: string | null;
  subjects?: { name: string; code: string | null } | null;
}

export interface ExamScheduleDto {
  id: string;
  examSubjectId: string;
  room: string | null;
  invigilatorId: string | null;
  teachers?: { displayName: string } | null;
}

export interface ExamDto {
  id: string;
  academicYearId: string;
  classId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  academicYears?: { name: string } | null;
  classes?: { name: string } | null;
  subjects?: ExamSubjectDto[];
}

export interface ExamSubjectStateDto extends ExamSubjectDto {
  isLocked: boolean;
  isPublished: boolean;
}

export interface MarkRowDto {
  id: string;
  examSubjectId: string;
  studentId: string;
  marksObtained: number | null;
  isAbsent: boolean;
  grade: string | null;
  version: number;
}

export interface StudentResultDto {
  studentId: string;
  displayName: string;
  admissionNo: string;
  subjects: {
    subjectId: string;
    subjectName: string;
    marksObtained: number | null;
    maxMarks: number;
    isAbsent: boolean;
    grade: string | null;
  }[];
  totalObtained: number;
  maxTotal: number;
  percentage: number | null;
  overallGrade: string | null;
  published: boolean;
}

export interface GradingSystemDto {
  id: string;
  name: string;
  isDefault: boolean;
  rules: {
    id: string;
    minPercentage: number;
    maxPercentage: number;
    grade: string;
    gradePoint: number | null;
    remarkTemplate: string | null;
  }[];
}

export interface ReportCardDto {
  id: string;
  examId: string;
  studentId: string;
  status: string;
  totalObtained: number;
  maxTotal: number;
  percentage: number | null;
  cgpa: number | null;
  overallGrade: string | null;
  attendancePercentage: number | null;
  remarks: string | null;
  pdfPath: string | null;
  createdAt: string;
}

export interface TimetableSlotDto {
  id: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string | null;
  teacherId: string | null;
  dayOfWeek: number;
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  subjects?: { name: string } | null;
  teachers?: { displayName: string } | null;
  sections?: { name: string } | null;
  classes?: { name: string } | null;
}
