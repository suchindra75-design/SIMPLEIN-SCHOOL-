import {
  authorizeRoles,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import {
  assertCanWritePeople,
  isAdmin,
  teacherSectionIds,
} from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type {
  AssignmentDto,
  SectionDto,
  TeacherDto,
} from "@/lib/services/dto";
import {
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import type { TeacherCreateInput } from "@/lib/validation/people";

const TEACHER_COLUMNS =
  "id, school_id, user_id, employee_no, first_name, last_name, display_name, phone, email, qualification, date_of_joining, photo_path, is_active, created_at";

export interface TeacherFilters {
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

function toCreateRow(schoolId: string, input: TeacherCreateInput) {
  return {
    school_id: schoolId,
    employee_no: input.employeeNo,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name:
      `${input.firstName} ${input.lastName}`.trim() || input.firstName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    qualification: input.qualification ?? null,
    date_of_joining: input.dateOfJoining ?? null,
  };
}

/** Teacher directory. Admins and teachers; parents use getTeacher (scoped). */
export async function listTeachers(
  db: DbClient,
  ctx: SessionContext,
  f: TeacherFilters,
): Promise<{ teachers: TeacherDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("teachers")
    .select(TEACHER_COLUMNS, { count: "exact" })
    .eq("school_id", ctx.profile.schoolId)
    .order("display_name")
    .range(from, from + f.limit - 1);
  if (f.isActive !== undefined) query = query.eq("is_active", f.isActive);
  if (f.search !== undefined && f.search !== "") {
    const q = `%${f.search.replace(/[%_]/g, "")}%`;
    query = query.or(`display_name.ilike.${q},employee_no.ilike.${q}`);
  }
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { teachers: toCamel<TeacherDto[]>(data ?? []), total: count ?? 0 };
}

interface TeacherRow {
  id: string;
  school_id: string;
}

/** Scoped read: admin/teacher directory; parents only their children's teachers. */
export async function getTeacher(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<TeacherDto> {
  const { data, error } = await db
    .from("teachers")
    .select(TEACHER_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Teacher not found");
  if (isAdmin(ctx) || ctx.roles.includes("TEACHER")) {
    return toCamel<TeacherDto>(data);
  }
  // Parent: teacher must teach a section containing a linked child.
  const scope = await getParentStudentSections(db, ctx);
  const taught = await taughtSectionIds(db, ctx.profile.schoolId, id);
  const overlap = [...taught].some((s) => scope.childSectionIds.has(s));
  if (!overlap) throw new TenantBoundaryError();
  return toCamel<TeacherDto>(data);
}

async function getParentStudentSections(db: DbClient, ctx: SessionContext) {
  const { data: parent, error: parentError } = await db
    .from("parents")
    .select("id")
    .eq("user_id", ctx.profile.id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (parentError !== null || parent === null) {
    throw new TenantBoundaryError();
  }
  const parentId = (parent as { id: string }).id;
  const { data: links, error: linkError } = await db
    .from("student_parents")
    .select("student_id")
    .eq("parent_id", parentId);
  throwForPostgrest(linkError);
  const studentIds = (links as { student_id: string }[]).map((l) => l.student_id);
  const childSectionIds = new Set<string>();
  if (studentIds.length > 0) {
    const { data: students, error: studentError } = await db
      .from("students")
      .select("section_id")
      .in("id", studentIds)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(studentError);
    for (const s of students as { section_id: string | null }[]) {
      if (s.section_id !== null) childSectionIds.add(s.section_id);
    }
  }
  return { parentId, childSectionIds };
}

async function taughtSectionIds(
  db: DbClient,
  schoolId: string,
  teacherId: string,
): Promise<Set<string>> {
  const { data: asClassTeacher, error: e1 } = await db
    .from("sections")
    .select("id")
    .eq("class_teacher_id", teacherId)
    .eq("school_id", schoolId);
  throwForPostgrest(e1);
  const { data: asSubjectTeacher, error: e2 } = await db
    .from("teacher_subjects")
    .select("section_id")
    .eq("teacher_id", teacherId)
    .eq("school_id", schoolId);
  throwForPostgrest(e2);
  return new Set([
    ...(asClassTeacher as { id: string }[]).map((s) => s.id),
    ...(asSubjectTeacher as { section_id: string }[]).map((s) => s.section_id),
  ]);
}

/** Admin only. */
export async function createTeacher(
  db: DbClient,
  ctx: SessionContext,
  input: TeacherCreateInput,
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("teachers")
    .insert(toCreateRow(ctx.profile.schoolId, input))
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "teacher.created", "teachers", id, {
    employeeNo: input.employeeNo,
  });
  return { id };
}

/** Admin only. Partial update incl. is_active. */
export async function updateTeacher(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: Partial<TeacherCreateInput> & { isActive?: boolean },
) {
  assertCanWritePeople(ctx);
  const row: Record<string, unknown> = {};
  if (patch.employeeNo !== undefined) row["employee_no"] = patch.employeeNo;
  if (patch.firstName !== undefined) row["first_name"] = patch.firstName;
  if (patch.lastName !== undefined) row["last_name"] = patch.lastName;
  if (patch.phone !== undefined) row["phone"] = patch.phone;
  if (patch.email !== undefined) row["email"] = patch.email;
  if (patch.qualification !== undefined) row["qualification"] = patch.qualification;
  if (patch.dateOfJoining !== undefined) row["date_of_joining"] = patch.dateOfJoining;
  if (patch.isActive !== undefined) row["is_active"] = patch.isActive;
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const current = await getTeacherRow(db, ctx, id);
    const first = (patch.firstName ?? current.first_name) as string;
    const last = (patch.lastName ?? current.last_name) as string;
    row["display_name"] = `${first} ${last}`.trim() || first;
  }
  const { data, error } = await db
    .from("teachers")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Teacher not found");
  await logAudit(db, ctx, "teacher.updated", "teachers", id, {
    fields: Object.keys(row),
  });
  return { id };
}

async function getTeacherRow(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<TeacherRow & Record<string, unknown>> {
  const { data, error } = await db
    .from("teachers")
    .select("id, school_id, first_name, last_name")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Teacher not found");
  return data as TeacherRow & Record<string, unknown>;
}

import { cache } from "react";

/* ------------------------- assignments & scope ------------------------- */

export interface TeacherScope {
  teacherId: string;
  sectionIds: Set<string>;
}

/** Resolve the caller's teacher scope (null when the user is not a teacher). */
export const getTeacherScope = cache(
  async (
    db: DbClient,
    ctx: SessionContext,
  ): Promise<TeacherScope | null> => {
    const { data, error } = await db
      .from("teachers")
      .select("id")
      .eq("user_id", ctx.profile.id)
      .eq("school_id", ctx.profile.schoolId)
      .eq("is_active", true)
      .maybeSingle();
    if (error !== null) throw new Error(error.message);
    if (data === null) return null;
    const teacherId = (data as { id: string }).id;
    const [{ data: classTeacher, error: e1 }, { data: assigned, error: e2 }] =
      await Promise.all([
        db
          .from("sections")
          .select("id")
          .eq("class_teacher_id", teacherId)
          .eq("school_id", ctx.profile.schoolId),
        db
          .from("teacher_subjects")
          .select("section_id")
          .eq("teacher_id", teacherId)
          .eq("school_id", ctx.profile.schoolId),
      ]);
    throwForPostgrest(e1);
    throwForPostgrest(e2);
    return {
      teacherId,
      sectionIds: teacherSectionIds({
        classTeacherSectionIds: (classTeacher as { id: string }[]).map(
          (s) => s.id,
        ),
        assignedSectionIds: (assigned as { section_id: string }[]).map(
          (s) => s.section_id,
        ),
      }),
    };
  },
);

/** Sections taught by a teacher (dashboard + scope checks). Admin or self. */
export async function listTeacherSections(
  db: DbClient,
  ctx: SessionContext,
  teacherId: string,
): Promise<{ sections: SectionDto[] }> {
  if (!isAdmin(ctx)) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || scope.teacherId !== teacherId) {
      throw new TenantBoundaryError();
    }
  }
  const ids = await taughtSectionIds(db, ctx.profile.schoolId, teacherId);
  if (ids.size === 0) return { sections: [] };
  const { data, error } = await db
    .from("sections")
    .select("id, name, class_id, classes(name)")
    .in("id", [...ids])
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  return { sections: toCamel<SectionDto[]>(data ?? []) };
}

/** Assignments of a teacher. Admin or self. */
export async function listTeacherAssignments(
  db: DbClient,
  ctx: SessionContext,
  teacherId: string,
): Promise<{ assignments: AssignmentDto[] }> {
  if (!isAdmin(ctx)) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || scope.teacherId !== teacherId) {
      throw new TenantBoundaryError();
    }
  }
  const { data, error } = await db
    .from("teacher_subjects")
    .select(
      "id, subject_id, section_id, academic_year_id, subjects(name), sections(name)",
    )
    .eq("teacher_id", teacherId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  return { assignments: toCamel<AssignmentDto[]>(data ?? []) };
}

/** Admin only. Each id is tenant-verified (404 on cross-school). */
export async function addTeacherAssignment(
  db: DbClient,
  ctx: SessionContext,
  teacherId: string,
  input: { subjectId: string; sectionId: string; academicYearId?: string | null },
) {
  assertCanWritePeople(ctx);
  const schoolId = ctx.profile.schoolId;
  await getTeacherRow(db, ctx, teacherId);
  for (const [table, id] of [
    ["subjects", input.subjectId],
    ["sections", input.sectionId],
  ] as const) {
    const { data, error } = await db
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError(`${table.slice(0, -1)} not found in this school`);
    }
  }
  if (input.academicYearId !== undefined && input.academicYearId !== null) {
    const { data, error } = await db
      .from("academic_years")
      .select("id")
      .eq("id", input.academicYearId)
      .eq("school_id", schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError("Academic year not found in this school");
    }
  }
  const { data, error } = await db
    .from("teacher_subjects")
    .insert({
      school_id: schoolId,
      teacher_id: teacherId,
      subject_id: input.subjectId,
      section_id: input.sectionId,
      academic_year_id: input.academicYearId ?? null,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "teacher.assigned", "teacher_subjects", id, {
    teacherId,
    ...input,
  });
  return { id };
}

/** Admin only. */
export async function removeTeacherAssignment(
  db: DbClient,
  ctx: SessionContext,
  teacherId: string,
  assignmentId: string,
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("teacher_subjects")
    .delete()
    .eq("id", assignmentId)
    .eq("teacher_id", teacherId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Assignment not found");
  await logAudit(db, ctx, "teacher.unassigned", "teacher_subjects", assignmentId, {
    teacherId,
  });
  return { id: (data as { id: string }).id };
}
