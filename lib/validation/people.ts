import { z } from "zod";

export const genderSchema = z.enum(["male", "female", "other"]);
export const studentStatusSchema = z.enum([
  "active",
  "inactive",
  "graduated",
  "transferred",
]);
export const relationSchema = z.enum(["father", "mother", "guardian", "other"]);
export const enrollmentStatusSchema = z.enum([
  "enrolled",
  "completed",
  "transferred",
  "withdrawn",
]);

const nameField = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(500).nullish();
const phoneField = z.string().trim().max(40).nullish();
const dateField = z.string().date().nullish();

/* ------------------------------ teachers ------------------------------ */

export const teacherCreateSchema = z.object({
  employeeNo: z.string().trim().min(1).max(80),
  firstName: nameField,
  lastName: z.string().trim().max(200).default(""),
  phone: phoneField,
  email: z.string().trim().toLowerCase().email().max(320).nullish(),
  qualification: optionalText,
  dateOfJoining: dateField,
});

export const teacherUpdateSchema = teacherCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type TeacherCreateInput = z.infer<typeof teacherCreateSchema>;

/* ------------------------------- parents ------------------------------ */

export const parentCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: phoneField,
  email: z.string().trim().toLowerCase().email().max(320).nullish(),
  address: optionalText,
});

export const parentUpdateSchema = parentCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type ParentCreateInput = z.infer<typeof parentCreateSchema>;

/* ------------------------------- students ------------------------------ */

export const studentCreateSchema = z.object({
  admissionNo: z.string().trim().min(1).max(80),
  firstName: nameField,
  middleName: z.string().trim().max(200).nullish(),
  lastName: z.string().trim().max(200).default(""),
  dob: dateField,
  gender: genderSchema.nullish(),
  address: optionalText,
  guardianPhone: phoneField,
  admissionDate: dateField,
  classId: z.string().uuid().nullish(),
  sectionId: z.string().uuid().nullish(),
  rollNumber: z.string().trim().max(20).nullish(),
});

export const studentUpdateSchema = studentCreateSchema.partial().extend({
  status: studentStatusSchema.optional(),
});

export type StudentCreateInput = z.infer<typeof studentCreateSchema>;

export const studentFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  status: studentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StudentFilters = z.infer<typeof studentFiltersSchema>;

/* --------------------------- student ↔ parent -------------------------- */

export const studentParentLinkSchema = z.object({
  parentId: z.string().uuid(),
  relation: relationSchema.default("guardian"),
  isPrimary: z.boolean().default(false),
});

export type StudentParentLinkInput = z.infer<typeof studentParentLinkSchema>;

/* ------------------------------ classes ------------------------------- */

export const classCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  orderIndex: z.number().int().min(0).default(0),
});

export const classUpdateSchema = classCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const sectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  orderIndex: z.number().int().min(0).default(0),
  classTeacherId: z.string().uuid().nullish(),
  room: z.string().trim().max(80).nullish(),
});

export const sectionUpdateSchema = sectionCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/* ------------------------------ subjects ------------------------------ */

export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(20).nullish(),
  orderIndex: z.number().int().min(0).default(0),
});

export const subjectUpdateSchema = subjectCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const classSubjectLinkSchema = z.object({
  subjectId: z.string().uuid(),
});

export const teacherAssignmentSchema = z.object({
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid(),
  academicYearId: z.string().uuid().nullish(),
});

export type TeacherAssignmentInput = z.infer<typeof teacherAssignmentSchema>;

/* ---------------------------- academic years --------------------------- */

export const academicYearCreateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  isCurrent: z.boolean().default(false),
});

export type AcademicYearCreateInput = z.infer<typeof academicYearCreateSchema>;

/* ------------------------- admin user management ----------------------- */
// Admins may grant TEACHER or PARENT only — never SCHOOL_ADMIN (reserved for
// onboarding) and never STUDENT (dormant). The identity links to an existing
// unlinked teacher/parent profile in the SAME school.
export const manageableRoleSchema = z.enum(["TEACHER", "PARENT"]);

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  fullName: z.string().trim().min(2).max(200),
  phone: phoneField,
  password: z.string().min(10).max(256),
  role: manageableRoleSchema,
  link: z.object({
    teacherId: z.string().uuid().optional(),
    parentId: z.string().uuid().optional(),
  }),
});

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  phone: phoneField,
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
