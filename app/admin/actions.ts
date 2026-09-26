"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  addTeacherAssignment,
  createTeacher,
  removeTeacherAssignment,
  updateTeacher,
} from "@/lib/services/teachers";
import {
  createParent,
  linkChild,
  unlinkChild,
  updateParent,
} from "@/lib/services/parents";
import {
  confirmStudentImport,
  previewStudentImport,
} from "@/lib/services/imports";
import {
  createClass,
  createSection,
  updateClass,
  updateSection,
} from "@/lib/services/classes";
import {
  createSubject,
  linkSubjectToClass,
  unlinkSubjectFromClass,
  updateSubject,
} from "@/lib/services/subjects";
import {
  addExamSubject,
  createExam,
  removeExamSchedule,
  removeExamSubject,
  setExamActive,
  updateExam,
  updateExamSubject,
  upsertExamSchedule,
} from "@/lib/services/exams";
import {
  saveMarks,
  setMarksLocked,
  setResultsPublished,
} from "@/lib/services/marks";
import {
  createTimetableSlot,
  deleteTimetableSlot,
  updateTimetableSlot,
} from "@/lib/services/timetable";
import {
  createStudent,
  updateStudent,
} from "@/lib/services/students";
import {
  addUserRole,
  createUserWithRole,
  setUserActive,
} from "@/lib/services/users";
import {
  buildPhotoPath,
  uploadPhoto,
  validatePhotoUpload,
} from "@/lib/services/storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ValidatedImportRow } from "@/lib/validation/import";

export interface ActionState {
  error?: string;
  success?: boolean;
  preview?: unknown;
}

function err(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : "Unexpected error" };
}

function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function optUuid(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value;
}

/* ------------------------------- students ------------------------------ */

export async function createStudentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createStudent(db, ctx, {
      admissionNo: str(form, "admissionNo") ?? "",
      firstName: str(form, "firstName") ?? "",
      middleName: str(form, "middleName"),
      lastName: str(form, "lastName") ?? "",
      dob: str(form, "dob"),
      gender: (str(form, "gender") as "male" | "female" | "other" | undefined),
      address: str(form, "address"),
      guardianPhone: str(form, "guardianPhone"),
      admissionDate: str(form, "admissionDate"),
      classId: optUuid(str(form, "classId")) ?? null,
      sectionId: optUuid(str(form, "sectionId")) ?? null,
      rollNumber: str(form, "rollNumber"),
    });
    revalidatePath("/admin/students");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateStudentAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const status = str(form, "status") as
      | "active"
      | "inactive"
      | "graduated"
      | "transferred"
      | undefined;
    await updateStudent(db, ctx, id, {
      admissionNo: str(form, "admissionNo"),
      firstName: str(form, "firstName"),
      middleName: str(form, "middleName") ?? null,
      lastName: str(form, "lastName"),
      dob: str(form, "dob") ?? null,
      gender: (str(form, "gender") as "male" | "female" | "other" | undefined) ?? null,
      address: str(form, "address") ?? null,
      guardianPhone: str(form, "guardianPhone") ?? null,
      admissionDate: str(form, "admissionDate") ?? null,
      classId: optUuid(str(form, "classId")) ?? null,
      sectionId: optUuid(str(form, "sectionId")) ?? null,
      rollNumber: str(form, "rollNumber") ?? null,
      status,
    });
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${id}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function uploadStudentPhotoAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const file = form.get("photo");
    if (!(file instanceof File)) return { error: "Choose a photo file" };
    const problem = validatePhotoUpload({
      size: file.size,
      type: file.type,
      name: file.name,
    });
    if (problem !== null) return { error: problem };
    const path = buildPhotoPath(ctx.profile.schoolId, "student", id, file.name);
    await uploadPhoto(db, "student", path, await file.arrayBuffer(), file.type);
    await updateStudent(db, ctx, id, {});
    // Persist the path directly (updateStudent has no photo field by design).
    const { error } = await db
      .from("students")
      .update({ photo_path: path })
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId);
    if (error !== null) return { error: error.message };
    revalidatePath(`/admin/students/${id}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* ------------------------------- teachers ------------------------------ */

export async function createTeacherAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createTeacher(db, ctx, {
      employeeNo: str(form, "employeeNo") ?? "",
      firstName: str(form, "firstName") ?? "",
      lastName: str(form, "lastName") ?? "",
      phone: str(form, "phone"),
      email: str(form, "email"),
      qualification: str(form, "qualification"),
      dateOfJoining: str(form, "dateOfJoining"),
    });
    revalidatePath("/admin/teachers");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateTeacherAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateTeacher(db, ctx, id, {
      employeeNo: str(form, "employeeNo"),
      firstName: str(form, "firstName"),
      lastName: str(form, "lastName"),
      phone: str(form, "phone") ?? null,
      email: str(form, "email") ?? null,
      qualification: str(form, "qualification") ?? null,
      dateOfJoining: str(form, "dateOfJoining") ?? null,
      isActive: form.get("isActive") === "on" ? true : undefined,
    });
    revalidatePath("/admin/teachers");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function addAssignmentAction(
  teacherId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await addTeacherAssignment(db, ctx, teacherId, {
      subjectId: str(form, "subjectId") ?? "",
      sectionId: str(form, "sectionId") ?? "",
    });
    revalidatePath(`/admin/teachers/${teacherId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function removeAssignmentAction(
  teacherId: string,
  assignmentId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await removeTeacherAssignment(db, ctx, teacherId, assignmentId);
    revalidatePath(`/admin/teachers/${teacherId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* -------------------------------- parents ------------------------------ */

export async function createParentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createParent(db, ctx, {
      fullName: str(form, "fullName") ?? "",
      phone: str(form, "phone"),
      email: str(form, "email"),
      address: str(form, "address"),
    });
    revalidatePath("/admin/parents");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateParentAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateParent(db, ctx, id, {
      fullName: str(form, "fullName"),
      phone: str(form, "phone") ?? null,
      email: str(form, "email") ?? null,
      address: str(form, "address") ?? null,
      isActive: form.get("isActive") === "on" ? true : undefined,
    });
    revalidatePath("/admin/parents");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function linkChildAction(
  parentId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await linkChild(db, ctx, parentId, str(form, "studentId") ?? "", {
      parentId: str(form, "parentId") ?? parentId,
      relation: (str(form, "relation") ?? "guardian") as
        | "father"
        | "mother"
        | "guardian"
        | "other",
      isPrimary: form.get("isPrimary") === "on",
    });
    revalidatePath(`/admin/parents/${parentId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function unlinkChildAction(
  parentId: string,
  studentId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await unlinkChild(db, ctx, parentId, studentId);
    revalidatePath(`/admin/parents/${parentId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* ----------------------------- classes ------------------------------- */

export async function createClassAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createClass(db, ctx, {
      name: str(form, "name") ?? "",
      orderIndex: Number(str(form, "orderIndex") ?? 0),
    });
    revalidatePath("/admin/classes");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function createSectionAction(
  classId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createSection(db, ctx, classId, {
      name: str(form, "name") ?? "",
      orderIndex: Number(str(form, "orderIndex") ?? 0),
      classTeacherId: str(form, "classTeacherId") ?? null,
      room: str(form, "room") ?? null,
    });
    revalidatePath(`/admin/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateSectionAction(
  classId: string,
  sectionId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const teacherRaw = str(form, "classTeacherId");
    await updateSection(db, ctx, sectionId, {
      name: str(form, "name"),
      room: str(form, "room") ?? null,
      classTeacherId: teacherRaw === undefined ? undefined : (teacherRaw || null),
    });
    revalidatePath(`/admin/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateClassAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateClass(db, ctx, id, {
      name: str(form, "name"),
      orderIndex: str(form, "orderIndex") === undefined ? undefined : Number(str(form, "orderIndex")),
    });
    revalidatePath("/admin/classes");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* ------------------------------- subjects ------------------------------ */

export async function createSubjectAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createSubject(db, ctx, {
      name: str(form, "name") ?? "",
      code: str(form, "code") ?? null,
      orderIndex: Number(str(form, "orderIndex") ?? 0),
    });
    revalidatePath("/admin/subjects");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateSubjectAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateSubject(db, ctx, id, {
      name: str(form, "name"),
      code: str(form, "code") ?? null,
      isActive: form.get("isActive") === "on" ? true : undefined,
    });
    revalidatePath("/admin/subjects");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function setSubjectActiveAction(
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateSubject(db, ctx, id, { isActive: active });
    revalidatePath("/admin/subjects");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function linkSubjectAction(
  classId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await linkSubjectToClass(db, ctx, classId, str(form, "subjectId") ?? "");
    revalidatePath(`/admin/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function unlinkSubjectAction(
  classId: string,
  subjectId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await unlinkSubjectFromClass(db, ctx, classId, subjectId);
    revalidatePath(`/admin/classes/${classId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* -------------------------------- users -------------------------------- */

export async function createUserAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const role = str(form, "role") === "PARENT" ? "PARENT" : "TEACHER";
    await createUserWithRole(db, ctx, {
      email: str(form, "email") ?? "",
      fullName: str(form, "fullName") ?? "",
      phone: str(form, "phone"),
      password: str(form, "password") ?? "",
      role,
      link: {
        teacherId: role === "TEACHER" ? str(form, "teacherId") : undefined,
        parentId: role === "PARENT" ? str(form, "parentId") : undefined,
      },
    });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function setUserActiveAction(
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await setUserActive(db, ctx, id, active);
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function addUserRoleAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const role = str(form, "role") === "PARENT" ? "PARENT" : "TEACHER";
    await addUserRole(db, ctx, id, role);
    revalidatePath(`/admin/users`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* -------------------------------- import ------------------------------- */

export async function previewImportAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Choose a .csv or .xlsx file" };
    const preview = await previewStudentImport(
      db,
      ctx,
      { name: file.name, bytes: await file.arrayBuffer() },
      undefined,
    );
    return { success: true, preview };
  } catch (error) {
    return err(error);
  }
}

export async function confirmImportAction(
  rows: ValidatedImportRow[],
): Promise<ActionState & { created?: number; failed?: number }> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const result = await confirmStudentImport(db, ctx, rows);
    revalidatePath("/admin/students");
    return {
      success: true,
      created: result.created,
      failed: result.failed.length,
    };
  } catch (error) {
    return err(error);
  }
}

/* --------------------------------- exams -------------------------------- */

export async function createExamAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await createExam(db, ctx, {
      name: str(form, "name") ?? "",
      academicYearId: str(form, "academicYearId") ?? "",
      classId: str(form, "classId") ?? "",
      startsOn: str(form, "startsOn") ?? "",
      endsOn: str(form, "endsOn") ?? "",
      subjects: [],
    });
    revalidatePath("/admin/exams");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateExamAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateExam(db, ctx, id, {
      name: str(form, "name"),
      startsOn: str(form, "startsOn"),
      endsOn: str(form, "endsOn"),
    });
    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/${id}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function setExamActiveAction(
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await setExamActive(db, ctx, id, active);
    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/${id}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function addExamSubjectAction(
  examId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await addExamSubject(db, ctx, examId, {
      subjectId: str(form, "subjectId") ?? "",
      maxMarks: Number(str(form, "maxMarks") ?? 0),
      passingMarks: Number(str(form, "passingMarks") ?? 0),
      examDate: str(form, "examDate"),
      startTime: str(form, "startTime"),
      endTime: str(form, "endTime"),
    });
    revalidatePath(`/admin/exams/${examId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateExamSubjectAction(
  examId: string,
  examSubjectId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const maxRaw = str(form, "maxMarks");
    const passRaw = str(form, "passingMarks");
    const dateRaw = str(form, "examDate");
    await updateExamSubject(db, ctx, examSubjectId, {
      maxMarks: maxRaw === undefined ? undefined : Number(maxRaw),
      passingMarks: passRaw === undefined ? undefined : Number(passRaw),
      examDate: dateRaw,
      startTime: str(form, "startTime"),
      endTime: str(form, "endTime"),
    });
    revalidatePath(`/admin/exams/${examId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function removeExamSubjectAction(
  examId: string,
  examSubjectId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await removeExamSubject(db, ctx, examSubjectId);
    revalidatePath(`/admin/exams/${examId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function upsertExamScheduleAction(
  examId: string,
  examSubjectId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const invigilatorRaw = str(form, "invigilatorId");
    await upsertExamSchedule(db, ctx, examSubjectId, {
      room: str(form, "room") ?? null,
      invigilatorId: invigilatorRaw === undefined ? undefined : (invigilatorRaw || null),
    });
    revalidatePath(`/admin/exams/${examId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function removeExamScheduleAction(
  examId: string,
  examSubjectId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await removeExamSchedule(db, ctx, examSubjectId);
    revalidatePath(`/admin/exams/${examId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* ---------------------------- marks + results --------------------------- */

export async function saveMarksAction(
  examSubjectId: string,
  records: { studentId: string; marksObtained: number | null; isAbsent: boolean }[],
): Promise<ActionState & { saved?: number; changed?: number }> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const result = await saveMarks(db, ctx, examSubjectId, { records });
    revalidatePath("/admin/marks");
    return { success: true, saved: result.saved, changed: result.changed };
  } catch (error) {
    return err(error);
  }
}

export async function setMarksLockedAction(
  examSubjectId: string,
  locked: boolean,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await setMarksLocked(db, ctx, examSubjectId, locked);
    revalidatePath("/admin/marks");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function setResultsPublishedAction(
  examSubjectId: string,
  published: boolean,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await setResultsPublished(db, ctx, examSubjectId, published);
    revalidatePath("/admin/marks");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* ------------------------------- timetable ------------------------------ */

export async function createTimetableSlotAction(
  sectionId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const teacherRaw = str(form, "teacherId");
    const subjectRaw = str(form, "subjectId");
    await createTimetableSlot(db, ctx, sectionId, {
      subjectId: subjectRaw === undefined ? null : subjectRaw,
      teacherId: teacherRaw === undefined ? null : teacherRaw,
      dayOfWeek: Number(str(form, "dayOfWeek") ?? 1),
      periodIndex: Number(str(form, "periodIndex") ?? 0),
      startsAt: str(form, "startsAt") ?? "",
      endsAt: str(form, "endsAt") ?? "",
      room: str(form, "room") ?? null,
    });
    revalidatePath(`/admin/timetable?sectionId=${sectionId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateTimetableSlotAction(
  sectionId: string,
  slotId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const teacherRaw = str(form, "teacherId");
    await updateTimetableSlot(db, ctx, slotId, {
      teacherId: teacherRaw === undefined ? undefined : (teacherRaw || null),
      startsAt: str(form, "startsAt"),
      endsAt: str(form, "endsAt"),
      room: str(form, "room"),
    });
    revalidatePath(`/admin/timetable?sectionId=${sectionId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function deleteTimetableSlotAction(
  sectionId: string,
  slotId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await deleteTimetableSlot(db, ctx, slotId);
    revalidatePath(`/admin/timetable?sectionId=${sectionId}`);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}
