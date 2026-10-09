import {
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import {
  assertCanWritePeople,
  assertParentStudentAccess,
  assertTeacherSectionAccess,
  isAdmin,
} from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type { LinkedParentDto, StudentDto } from "@/lib/services/dto";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { getParentScope } from "@/lib/services/parents";
import { getTeacherScope } from "@/lib/services/teachers";
import type {
  StudentCreateInput,
  StudentFilters,
} from "@/lib/validation/people";

const STUDENT_COLUMNS =
  "id, school_id, admission_no, first_name, middle_name, last_name, display_name, dob, gender, photo_path, address, guardian_phone, admission_date, class_id, section_id, roll_number, status, created_at, classes(name), sections(name)";

function toCreateRow(schoolId: string, input: StudentCreateInput) {
  return {
    school_id: schoolId,
    admission_no: input.admissionNo,
    first_name: input.firstName,
    middle_name: input.middleName ?? null,
    last_name: input.lastName,
    display_name:
      `${input.firstName} ${input.lastName}`.trim() || input.firstName,
    dob: input.dob ?? null,
    gender: input.gender ?? null,
    address: input.address ?? null,
    guardian_phone: input.guardianPhone ?? null,
    admission_date: input.admissionDate ?? null,
    class_id: input.classId ?? null,
    section_id: input.sectionId ?? null,
    roll_number: input.rollNumber ?? null,
  };
}

/** Verify class/section pair: both in this school, section belongs to class. */
async function assertClassSection(
  db: DbClient,
  schoolId: string,
  classId: string | null | undefined,
  sectionId: string | null | undefined,
): Promise<void> {
  if (classId === undefined && sectionId === undefined) return;
  if (sectionId !== undefined && sectionId !== null) {
    const { data, error } = await db
      .from("sections")
      .select("id, class_id")
      .eq("id", sectionId)
      .eq("school_id", schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError("Section not found in this school");
    }
    const row = data as { id: string; class_id: string };
    if (classId !== undefined && classId !== null && row.class_id !== classId) {
      throw new ConflictError("Section does not belong to the given class");
    }
  } else if (classId !== undefined && classId !== null) {
    const { data, error } = await db
      .from("classes")
      .select("id")
      .eq("id", classId)
      .eq("school_id", schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError("Class not found in this school");
    }
  }
}

/**
 * Server-side search/filter. Tenant is always the session school.
 * Teachers are pre-scoped to assigned sections; parents to linked children.
 */
export async function listStudents(
  db: DbClient,
  ctx: SessionContext,
  f: StudentFilters,
): Promise<{ students: StudentDto[]; total: number }> {
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("students")
    .select(STUDENT_COLUMNS, { count: "exact" })
    .eq("school_id", ctx.profile.schoolId)
    .order("last_name")
    .order("first_name")
    .range(from, from + f.limit - 1);

  if (!isAdmin(ctx)) {
    if (ctx.roles.includes("TEACHER")) {
      const scope = await getTeacherScope(db, ctx);
      if (scope === null || scope.sectionIds.size === 0) {
        return { students: [], total: 0 };
      }
      if (f.sectionId !== undefined && !scope.sectionIds.has(f.sectionId)) {
        throw new TenantBoundaryError();
      }
      query = f.sectionId !== undefined
        ? query.eq("section_id", f.sectionId)
        : query.in("section_id", [...scope.sectionIds]);
    } else if (ctx.roles.includes("PARENT")) {
      const scope = await getParentScope(db, ctx);
      if (scope === null || scope.studentIds.size === 0) {
        return { students: [], total: 0 };
      }
      query = query.in("id", [...scope.studentIds]);
    } else if (ctx.roles.includes("STUDENT")) {
      // Student: own row only.
      const scope = await getStudentScope(db, ctx);
      if (scope === null) return { students: [], total: 0 };
      query = query.eq("id", scope.studentId);
    } else {
      throw new TenantBoundaryError();
    }
  } else if (f.sectionId !== undefined) {
    query = query.eq("section_id", f.sectionId);
  }

  if (f.classId !== undefined) query = query.eq("class_id", f.classId);
  if (f.status !== undefined) query = query.eq("status", f.status);
  if (f.search !== undefined && f.search !== "") {
    const q = `%${f.search.replace(/[%_]/g, "")}%`;
    query = query.or(
      `display_name.ilike.${q},admission_no.ilike.${q},first_name.ilike.${q},last_name.ilike.${q}`,
    );
  }
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { students: toCamel<StudentDto[]>(data ?? []), total: count ?? 0 };
}

/** Scoped single read (admin / assigned teacher / linked parent). */
export async function getStudent(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<{ student: StudentDto; parents: LinkedParentDto[] }> {
  const { data, error } = await db
    .from("students")
    .select(STUDENT_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Student not found");
  const row = data as { id: string; section_id: string | null };
  await assertStudentAccess(db, ctx, row);
  const { data: links, error: linkError } = await db
    .from("student_parents")
    .select("parent_id, relation, is_primary, parents(id, full_name, phone)")
    .eq("student_id", id);
  throwForPostgrest(linkError);
  return {
    student: toCamel<StudentDto>(data),
    parents: toCamel<LinkedParentDto[]>(links ?? []),
  };
}

export async function assertStudentAccess(
  db: DbClient,
  ctx: SessionContext,
  row: { id: string; section_id: string | null },
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (ctx.roles.includes("TEACHER")) {
    if (row.section_id === null) throw new TenantBoundaryError();
    const scope = await getTeacherScope(db, ctx);
    assertTeacherSectionAccess(
      ctx,
      row.section_id,
      scope === null ? new Set() : scope.sectionIds,
    );
    return;
  }
  if (ctx.roles.includes("PARENT")) {
    const scope = await getParentScope(db, ctx);
    assertParentStudentAccess(
      ctx,
      row.id,
      scope === null ? new Set() : scope.studentIds,
    );
    return;
  }
  if (ctx.roles.includes("STUDENT")) {
    // Student: own row only.
    const scope = await getStudentScope(db, ctx);
    if (scope === null || scope.studentId !== row.id) {
      throw new TenantBoundaryError();
    }
    return;
  }
  throw new TenantBoundaryError();
}

import { cache } from "react";

export interface StudentScope {
  studentId: string;
  classId: string | null;
  sectionId: string | null;
}

/** Resolve the caller's student scope (null when the user has no student profile). */
export const getStudentScope = cache(
  async (
    db: DbClient,
    ctx: SessionContext,
  ): Promise<StudentScope | null> => {
    const { data, error } = await db
      .from("students")
      .select("id, class_id, section_id")
      .eq("user_id", ctx.profile.id)
      .eq("school_id", ctx.profile.schoolId)
      .eq("status", "active")
      .maybeSingle();
    if (error !== null) throw new Error(error.message);
    if (data === null) return null;
    const row = data as {
      id: string;
      class_id: string | null;
      section_id: string | null;
    };
    return {
      studentId: row.id,
      classId: row.class_id,
      sectionId: row.section_id,
    };
  },
);

/** Admin only. */
export async function createStudent(
  db: DbClient,
  ctx: SessionContext,
  input: StudentCreateInput,
) {
  assertCanWritePeople(ctx);
  await assertClassSection(
    db,
    ctx.profile.schoolId,
    input.classId,
    input.sectionId,
  );
  const { data, error } = await db
    .from("students")
    .insert(toCreateRow(ctx.profile.schoolId, input))
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await syncEnrollment(db, ctx, id, input.classId, input.sectionId, input.rollNumber);
  await logAudit(db, ctx, "student.created", "students", id, {
    admissionNo: input.admissionNo,
  });
  return { id };
}

/** Admin only. */
export async function updateStudent(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: Partial<StudentCreateInput> & { status?: string },
) {
  assertCanWritePeople(ctx);
  // Verify the row is in this school first (404 otherwise).
  const { data: existing, error: existingError } = await db
    .from("students")
    .select("id, first_name, last_name")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (existingError !== null || existing === null) {
    throw new NotFoundError("Student not found");
  }
  await assertClassSection(db, ctx.profile.schoolId, patch.classId, patch.sectionId);
  const row: Record<string, unknown> = {};
  if (patch.admissionNo !== undefined) row["admission_no"] = patch.admissionNo;
  if (patch.firstName !== undefined) row["first_name"] = patch.firstName;
  if (patch.middleName !== undefined) row["middle_name"] = patch.middleName;
  if (patch.lastName !== undefined) row["last_name"] = patch.lastName;
  if (patch.dob !== undefined) row["dob"] = patch.dob;
  if (patch.gender !== undefined) row["gender"] = patch.gender;
  if (patch.address !== undefined) row["address"] = patch.address;
  if (patch.guardianPhone !== undefined) row["guardian_phone"] = patch.guardianPhone;
  if (patch.admissionDate !== undefined) row["admission_date"] = patch.admissionDate;
  if (patch.classId !== undefined) row["class_id"] = patch.classId;
  if (patch.sectionId !== undefined) row["section_id"] = patch.sectionId;
  if (patch.rollNumber !== undefined) row["roll_number"] = patch.rollNumber;
  if (patch.status !== undefined) row["status"] = patch.status;
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const current = existing as { first_name: string; last_name: string };
    const first = (patch.firstName ?? current.first_name) as string;
    const last = (patch.lastName ?? current.last_name) as string;
    row["display_name"] = `${first} ${last}`.trim() || first;
  }
  const { data, error } = await db
    .from("students")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id, class_id, section_id, roll_number")
    .single();
  throwForPostgrest(error, "Student not found");
  const updated = data as {
    id: string;
    class_id: string | null;
    section_id: string | null;
    roll_number: string | null;
  };
  if (patch.classId !== undefined || patch.sectionId !== undefined) {
    await syncEnrollment(db, ctx, id, updated.class_id, updated.section_id, updated.roll_number);
  }
  await logAudit(db, ctx, "student.updated", "students", id, {
    fields: Object.keys(row),
  });
  return { id };
}

/** Snapshot the current placement into the current academic year (if any).
 *  History rows are never overwritten for other years. */
async function syncEnrollment(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
  classId: string | null | undefined,
  sectionId: string | null | undefined,
  rollNumber: string | null | undefined,
): Promise<void> {
  const { data: year, error } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_current", true)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  if (year === null) return;
  const yearId = (year as { id: string }).id;
  const { error: upsertError } = await db.from("student_enrollments").upsert(
    {
      school_id: ctx.profile.schoolId,
      student_id: studentId,
      academic_year_id: yearId,
      class_id: classId ?? null,
      section_id: sectionId ?? null,
      roll_number: rollNumber ?? null,
      status: "enrolled",
    },
    { onConflict: "student_id,academic_year_id" },
  );
  if (upsertError !== null) {
    throw new Error(`Enrollment sync failed: ${upsertError.message}`);
  }
}

/** Admin only. Deactivation preserves history (no hard delete in V1). */
export async function setStudentStatus(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  status: "active" | "inactive" | "graduated" | "transferred",
) {
  return updateStudent(db, ctx, id, { status });
}
