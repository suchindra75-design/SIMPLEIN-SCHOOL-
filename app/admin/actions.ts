"use server";

import { publicErrorMessage } from "@/lib/errors/public-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { logAudit } from "@/lib/services/audit";
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
  /** Shown instead of "Saved" when the outcome needs explaining. */
  notice?: string;
  preview?: unknown;
}

function err(error: unknown): ActionState {
  return { error: publicErrorMessage(error, "admin-action") };
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
    const parentPhone = str(form, "parentPhone");
    const parentName = str(form, "parentName");
    const parentEmail = str(form, "parentEmail");
    const parentRelation = (str(form, "parentRelation") ?? "guardian") as
      | "father"
      | "mother"
      | "guardian"
      | "other";

    const studentResult = await createStudent(db, ctx, {
      admissionNo: str(form, "admissionNo") ?? "",
      firstName: str(form, "firstName") ?? "",
      middleName: str(form, "middleName"),
      lastName: str(form, "lastName") ?? "",
      dob: str(form, "dob"),
      gender: (str(form, "gender") as "male" | "female" | "other" | undefined),
      address: str(form, "address"),
      guardianPhone: str(form, "guardianPhone") ?? parentPhone,
      admissionDate: str(form, "admissionDate"),
      classId: optUuid(str(form, "classId")) ?? null,
      sectionId: optUuid(str(form, "sectionId")) ?? null,
      rollNumber: str(form, "rollNumber"),
    });

    if (parentPhone !== undefined || parentName !== undefined) {
      // Check if parent with this phone already exists in the same school
      let parentId: string | undefined;
      if (parentPhone !== undefined) {
        const { data: existingParent } = await db
          .from("parents")
          .select("id")
          .eq("school_id", ctx.profile.schoolId)
          .eq("phone", parentPhone)
          .maybeSingle();
        if (existingParent !== null) {
          parentId = existingParent.id;
        }
      }

      if (!parentId) {
        const newParent = await createParent(db, ctx, {
          fullName: parentName ?? "Parent",
          phone: parentPhone,
          email: parentEmail,
          address: str(form, "address"),
        });
        parentId = newParent.id;
      }

      await linkChild(db, ctx, parentId, studentResult.id, {
        parentId,
        relation: parentRelation,
        isPrimary: true,
      });
    }

    revalidatePath("/admin/students");
    revalidatePath("/admin/parents");
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
    // Persist the path directly (updateStudent has no photo field by design).
    const { error } = await db
      .from("students")
      .update({ photo_path: path })
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId);
    if (error !== null) return { error: error.message };
    await logAudit(db, ctx, "student.photo_updated", "students", id, {
      name: file.name,
      size: file.size,
    });
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
      // The edit form always renders this checkbox; unticked posts nothing.
      isActive: form.get("isActive") === "on",
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
      // The edit form always renders this checkbox; unticked posts nothing.
      isActive: form.get("isActive") === "on",
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
    const roleRaw = str(form, "role") ?? "TEACHER";
    const role =
      roleRaw === "PARENT"
        ? "PARENT"
        : roleRaw === "STUDENT"
          ? "STUDENT"
          : "TEACHER";
    await createUserWithRole(db, ctx, {
      email: str(form, "email") ?? "",
      fullName: str(form, "fullName") ?? "",
      phone: str(form, "phone"),
      password: str(form, "password") ?? "",
      role,
      link: {
        teacherId: role === "TEACHER" ? str(form, "teacherId") : undefined,
        parentId: role === "PARENT" ? str(form, "parentId") : undefined,
        studentId: role === "STUDENT" ? str(form, "studentId") : undefined,
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

/* ----------------------------- report cards ----------------------------- */

/** Generate (or regenerate) one student's report card for an exam. */
export async function generateReportCardAction(
  studentId: string,
  examId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { generateReportCard } = await import("@/lib/services/report-cards");
    await generateReportCard(db, ctx, studentId, examId);
    revalidatePath("/admin/report-cards");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/** Generate report cards for every enrolled student of the exam's class. */
export async function generateExamReportCardsAction(examId: string): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { data: exam, error } = await db
      .from("exams")
      .select("id, class_id, academic_year_id")
      .eq("id", examId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (error !== null || exam === null) return { error: "Exam not found" };
    const { getClassRoster } = await import("@/lib/services/marks");
    const { generateReportCard } = await import("@/lib/services/report-cards");
    const row = exam as { id: string; class_id: string; academic_year_id: string };
    const roster = await getClassRoster(db, ctx, row.class_id, row.academic_year_id);
    let failed = 0;
    for (const student of roster) {
      try {
        await generateReportCard(db, ctx, student.id, examId);
      } catch {
        failed += 1;
      }
    }
    revalidatePath("/admin/report-cards");
    if (roster.length === 0) return { error: "No enrolled students for this exam's class" };
    return failed === 0
      ? { success: true }
      : { error: `${roster.length - failed} generated, ${failed} could not be generated` };
  } catch (error) {
    return err(error);
  }
}

/* ---------------------------- academic years ---------------------------- */

export async function createAcademicYearAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const name = str(form, "name");
    const startsOn = str(form, "startsOn");
    const endsOn = str(form, "endsOn");
    if (name === undefined || name.length < 2) return { error: "Enter a year name, e.g. 2027-28" };
    if (startsOn === undefined || endsOn === undefined) return { error: "Enter both start and end dates" };
    const { createAcademicYear } = await import("@/lib/services/years");
    await createAcademicYear(db, ctx, {
      name,
      startsOn,
      endsOn,
      isCurrent: form.get("isCurrent") === "on",
    });
    revalidatePath("/admin/academic-years");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function setCurrentAcademicYearAction(id: string): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { setCurrentAcademicYear } = await import("@/lib/services/years");
    await setCurrentAcademicYear(db, ctx, id);
    revalidatePath("/admin/academic-years");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* ------------------------------ promotions ------------------------------ */

export async function promoteStudentsAction(
  _prev: ActionState,
  form: FormData,
): Promise<
  ActionState & { promoted?: number; graduated?: number; held?: number; failed?: number; failure?: string }
> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const fromYearId = str(form, "fromYearId") ?? "";
    const toYearId = str(form, "toYearId") ?? "";
    if (fromYearId === "" || toYearId === "") {
      return { error: "Select both academic years" };
    }
    // Per-student rows: studentId_<i> + nextSectionId_<i> + hold_<i>.
    const assignments: {
      studentId: string;
      nextClassId: string | null;
      nextSectionId: string | null;
      hold: boolean;
    }[] = [];
    for (let i = 0; i < 500; i++) {
      const studentId = str(form, `studentId_${i}`);
      if (studentId === undefined) continue;
      const sectionId = str(form, `nextSectionId_${i}`);
      const nextClassRaw = str(form, `nextClassId_${i}`);
      assignments.push({
        studentId,
        nextClassId: nextClassRaw === undefined ? null : nextClassRaw,
        nextSectionId: sectionId === undefined ? null : sectionId,
        hold: form.get(`hold_${i}`) === "on",
      });
    }
    if (assignments.length === 0) {
      return { error: "No students selected" };
    }
    const { promoteStudents } = await import("@/lib/services/promotions");
    const result = await promoteStudents(db, ctx, {
      fromYearId,
      toYearId,
      assignments,
    });
    revalidatePath("/admin/promotions");
    return {
      success: true,
      promoted: result.promoted,
      graduated: result.graduated,
      held: result.held,
      failed: result.failed.length,
      ...(result.failed[0] !== undefined ? { failure: result.failed[0].message } : {}),
    };
  } catch (error) {
    return err(error);
  }
}

/** Plain-form promotion submission: runs the promotion, then returns to the
 *  page with the outcome in the query string so it is shown to the admin. */
export async function promoteStudentsFormAction(
  prev: ActionState,
  form: FormData,
): Promise<void> {
  const result = await promoteStudentsAction(prev, form);
  const params = new URLSearchParams();
  for (const key of ["fromYearId", "toYearId", "classId"]) {
    const value = str(form, key);
    if (value !== undefined) params.set(key, value);
  }
  if (result.error !== undefined) {
    params.set("error", result.error);
  } else {
    params.set("promoted", String(result.promoted ?? 0));
    params.set("graduated", String(result.graduated ?? 0));
    params.set("held", String(result.held ?? 0));
    params.set("failed", String(result.failed ?? 0));
    if (result.failure !== undefined) params.set("failure", result.failure);
  }
  redirect(`/admin/promotions?${params.toString()}`);
}

/* --------------------------------- pyqs ---------------------------------- */

/** Multipart PYQ upload (file + optional solution/answerKey + metadata). */
export async function createPyqAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { createPyq } = await import("@/lib/services/pyqs");
    const { MAX_HOMEWORK_FILE_BYTES } = await import("@/lib/services/storage");
    // Empty optional file inputs arrive as 0-byte Files: treat them as absent.
    const fileField = async (key: string) => {
      const raw = form.get(key);
      if (!(raw instanceof File) || raw.size === 0) return null;
      if (raw.size > MAX_HOMEWORK_FILE_BYTES) throw new Error(`${raw.name} must be under 4 MB`);
      return { name: raw.name, type: raw.type, size: raw.size, bytes: await raw.arrayBuffer() };
    };
    const file = await fileField("file");
    if (file === null) return { error: "Attach the question paper" };
    await createPyq(
      db,
      ctx,
      {
        classId: str(form, "classId") ?? "",
        subjectId: str(form, "subjectId") ?? "",
        yearLabel: str(form, "yearLabel") ?? "",
        examBoardName: str(form, "examBoardName") ?? "",
        title: str(form, "title") ?? null,
      },
      { file, solution: await fileField("solution"), answerKey: await fileField("answerKey") },
    );
    revalidatePath("/admin/pyqs");
    revalidatePath("/student/pyqs");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updatePyqAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { updatePyq } = await import("@/lib/services/pyqs");
  await updatePyq(db, ctx, id, {
    yearLabel: str(form, "yearLabel"),
    examBoardName: str(form, "examBoardName"),
    title: str(form, "title") ?? null,
  });
  revalidatePath("/admin/pyqs");
  revalidatePath("/student/pyqs");
  return { success: true };
}

export async function archivePyqAction(id: string): Promise<void> {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { setPyqActive } = await import("@/lib/services/pyqs");
  await setPyqActive(db, ctx, id, false);
  revalidatePath("/admin/pyqs");
  revalidatePath("/student/pyqs");
}

export async function restorePyqAction(id: string): Promise<void> {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { setPyqActive } = await import("@/lib/services/pyqs");
  await setPyqActive(db, ctx, id, true);
  revalidatePath("/admin/pyqs");
  revalidatePath("/student/pyqs");
}
