import {
  authorizeRoles,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { getParentScope } from "@/lib/services/parents";
import { getTeacherScope } from "@/lib/services/teachers";
import type {
  ExamDto,
  ExamScheduleDto,
  ExamSubjectDto,
} from "@/lib/services/dto";
import type {
  ExamCreateInput,
  ExamScheduleInput,
  ExamSubjectInput,
  ExamSubjectUpdateInput,
  ExamUpdateInput,
} from "@/lib/validation/exams";

/**
 * Exams service (Phase 5). Reuses the existing scope/tenant/audit
 * abstractions. Exams are CLASS-scoped: teacher relevance = the exam's class
 * contains one of the teacher's assigned sections; parent scope = the exam's
 * class matches a linked child's class. Marks entry lands in Phase 6 — this
 * phase is configuration (max/passing marks) + schedules only.
 */

const EXAM_COLUMNS =
  "id, school_id, academic_year_id, class_id, name, starts_on, ends_on, is_active, academic_years(name), classes(name)";
const EXAM_SUBJECT_COLUMNS =
  "id, school_id, exam_id, subject_id, max_marks, passing_marks, exam_date, start_time, end_time, subjects(name, code)";
const SCHEDULE_COLUMNS =
  "id, school_id, exam_subject_id, room, invigilator_id, teachers(display_name)";

/* ------------------------------ scope helpers --------------------------- */

/** Class ids the caller may see exams for (admin → all school classes). */
export async function examScopeClassIds(
  db: DbClient,
  ctx: SessionContext,
): Promise<Set<string>> {
  if (isAdmin(ctx)) {
    const { data, error } = await db
      .from("classes")
      .select("id")
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(error);
    return new Set((data as { id: string }[]).map((c) => c.id));
  }
  if (ctx.roles.includes("TEACHER")) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || scope.sectionIds.size === 0) return new Set();
    const { data, error } = await db
      .from("sections")
      .select("id, class_id")
      .in("id", [...scope.sectionIds])
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(error);
    return new Set(
      (data as { class_id: string }[]).map((s) => s.class_id),
    );
  }
  if (ctx.roles.includes("PARENT")) {
    const scope = await getParentScope(db, ctx);
    if (scope === null || scope.studentIds.size === 0) return new Set();
    const { data, error } = await db
      .from("students")
      .select("id, class_id")
      .in("id", [...scope.studentIds])
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(error);
    return new Set(
      (data as { class_id: string | null }[])
        .map((s) => s.class_id)
        .filter((c): c is string => c !== null),
    );
  }
  throw new TenantBoundaryError();
}

/* ------------------------------- validation ------------------------------ */

/** Rejects invalid exam-subject configuration (pure). */
export function validateExamSubjectConfig(
  input: Pick<ExamSubjectInput, "maxMarks" | "passingMarks" | "startTime" | "endTime">,
): string | null {
  if (!(input.maxMarks > 0)) return "Max marks must be greater than 0";
  if (input.passingMarks < 0) return "Passing marks cannot be negative";
  if (input.passingMarks > input.maxMarks) {
    return "Passing marks must be less than or equal to max marks";
  }
  if (
    input.startTime !== undefined &&
    input.endTime !== undefined &&
    input.startTime >= input.endTime
  ) {
    return "End time must be after start time";
  }
  return null;
}

async function assertExamInSchool(
  db: DbClient,
  schoolId: string,
  examId: string,
): Promise<void> {
  const { data, error } = await db
    .from("exams")
    .select("id")
    .eq("id", examId)
    .eq("school_id", schoolId)
    .single();
  if (error !== null || data === null) {
    throw new NotFoundError("Exam not found in this school");
  }
}

/* ------------------------------- list/read ------------------------------- */

export interface ExamFilters {
  academicYearId?: string;
  classId?: string;
  page: number;
  limit: number;
}

/** Auto-scoped exam list: admin → school; teacher → assigned classes; parent → children's classes. */
export async function listExams(
  db: DbClient,
  ctx: SessionContext,
  f: ExamFilters,
): Promise<{ exams: ExamDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const scopeClasses = await examScopeClassIds(db, ctx);
  if (f.classId !== undefined) {
    if (!scopeClasses.has(f.classId)) throw new TenantBoundaryError();
  } else if (scopeClasses.size === 0) {
    return { exams: [], total: 0 };
  }
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("exams")
    .select(EXAM_COLUMNS, { count: "exact" })
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_active", true)
    .order("starts_on", { ascending: false })
    .range(from, from + f.limit - 1);
  query =
    f.classId !== undefined
      ? query.eq("class_id", f.classId)
      : query.in("class_id", [...scopeClasses]);
  if (f.academicYearId !== undefined) {
    query = query.eq("academic_year_id", f.academicYearId);
  }
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { exams: toCamel<ExamDto[]>(data ?? []), total: count ?? 0 };
}

/** Scoped exam detail with subjects + schedules (404 on cross-tenant). */
export async function getExam(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<ExamDto> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("exams")
    .select(EXAM_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Exam not found");
  const exam = toCamel<ExamDto>(data);
  const scopeClasses = await examScopeClassIds(db, ctx);
  if (!scopeClasses.has(exam.classId)) throw new TenantBoundaryError();
  const { data: subjects, error: subError } = await db
    .from("exam_subjects")
    .select(EXAM_SUBJECT_COLUMNS)
    .eq("exam_id", id)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(subError);
  const typedSubjects = toCamel<ExamSubjectDto[]>(subjects ?? []);
  if (typedSubjects.length > 0) {
    const { data: schedules, error: schError } = await db
      .from("exam_schedules")
      .select(SCHEDULE_COLUMNS)
      .in(
        "exam_subject_id",
        typedSubjects.map((s) => s.id),
      )
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(schError);
    const bySubject = new Map(
      toCamel<ExamScheduleDto[]>(schedules ?? []).map((s) => [s.examSubjectId, s]),
    );
    return {
      ...exam,
      subjects: typedSubjects.map((s) => ({ ...s, schedule: bySubject.get(s.id) })),
    };
  }
  return { ...exam, subjects: [] };
}

/* ------------------------------- mutations ------------------------------- */

/** Admin only. Creates the exam + its subject configs in one batch. */
export async function createExam(
  db: DbClient,
  ctx: SessionContext,
  input: ExamCreateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const schoolId = ctx.profile.schoolId;

  // Verify year + class are in this school (404 on cross-tenant).
  for (const [table, id] of [
    ["academic_years", input.academicYearId],
    ["classes", input.classId],
  ] as const) {
    const { data, error } = await db
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError(
        table === "classes"
          ? "Class not found in this school"
          : "Academic year not found in this school",
      );
    }
  }

  // Subject configs must be valid + subjects in this school.
  const subjectIds = new Set<string>();
  for (const s of input.subjects) {
    const problem = validateExamSubjectConfig(s);
    if (problem !== null) throw new ConflictError(problem);
    if (subjectIds.has(s.subjectId)) {
      throw new ConflictError("Duplicate subject in exam definition");
    }
    subjectIds.add(s.subjectId);
    if (s.examDate !== undefined && (s.examDate < input.startsOn || s.examDate > input.endsOn)) {
      throw new ConflictError("Subject exam date must fall within the exam window");
    }
  }
  if (subjectIds.size > 0) {
    const { data: subjects, error: subError } = await db
      .from("subjects")
      .select("id")
      .in("id", [...subjectIds])
      .eq("school_id", schoolId);
    throwForPostgrest(subError);
    if ((subjects ?? []).length !== subjectIds.size) {
      throw new NotFoundError("One or more subjects not found in this school");
    }
  }

  const { data: exam, error: examError } = await db
    .from("exams")
    .insert({
      school_id: schoolId,
      academic_year_id: input.academicYearId,
      class_id: input.classId,
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      is_active: true,
    })
    .select("id")
    .single();
  throwForPostgrest(examError);
  const examId = (exam as { id: string }).id;

  if (input.subjects.length > 0) {
    const { error: insertError } = await db.from("exam_subjects").insert(
      input.subjects.map((s) => ({
        school_id: schoolId,
        exam_id: examId,
        subject_id: s.subjectId,
        max_marks: s.maxMarks,
        passing_marks: s.passingMarks,
        exam_date: s.examDate ?? null,
        start_time: s.startTime ?? null,
        end_time: s.endTime ?? null,
      })),
    );
    throwForPostgrest(insertError);
  }

  await logAudit(db, ctx, "exam.created", "exams", examId, {
    name: input.name,
    classId: input.classId,
    subjectCount: input.subjects.length,
  });
  return { id: examId };
}

/** Admin only. */
export async function updateExam(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: ExamUpdateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row["name"] = patch.name;
  if (patch.startsOn !== undefined) row["starts_on"] = patch.startsOn;
  if (patch.endsOn !== undefined) row["ends_on"] = patch.endsOn;
  if (Object.keys(row).length === 0) return { id };
  const { data, error } = await db
    .from("exams")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id, starts_on, ends_on")
    .single();
  throwForPostgrest(error, "Exam not found");
  const updated = data as { id: string; starts_on: string; ends_on: string };
  // Subject exam dates must still fall within the (possibly new) window.
  const { data: subjects, error: subError } = await db
    .from("exam_subjects")
    .select("id, exam_date")
    .eq("exam_id", id)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(subError);
  const outside = ((subjects ?? []) as { id: string; exam_date: string | null }[])
    .filter((s) => s.exam_date !== null)
    .filter(
      (s) =>
        s.exam_date !== null &&
        (s.exam_date < updated.starts_on || s.exam_date > updated.ends_on),
    );
  if (outside.length > 0) {
    throw new ConflictError(
      `${outside.length} subject exam date(s) fall outside the new exam window`,
    );
  }
  await logAudit(db, ctx, "exam.updated", "exams", id, {
    fields: Object.keys(row),
  });
  return { id };
}

/** Admin only. Activation/deactivation is an explicit, audited action. */
export async function setExamActive(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("exams")
    .update({ is_active: active })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Exam not found");
  await logAudit(db, ctx, active ? "exam.activated" : "exam.deactivated", "exams", id, {});
  return { id: (data as { id: string }).id };
}

/** Admin only. Adds one subject config to an exam (UNIQUE → 409 on dup). */
export async function addExamSubject(
  db: DbClient,
  ctx: SessionContext,
  examId: string,
  input: ExamSubjectInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  await assertExamInSchool(db, ctx.profile.schoolId, examId);
  const problem = validateExamSubjectConfig(input);
  if (problem !== null) throw new ConflictError(problem);
  if (input.examDate !== undefined) {
    const { data: exam, error: examError } = await db
      .from("exams")
      .select("starts_on, ends_on")
      .eq("id", examId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    throwForPostgrest(examError, "Exam not found");
    const window = exam as { starts_on: string; ends_on: string };
    if (input.examDate < window.starts_on || input.examDate > window.ends_on) {
      throw new ConflictError("Subject exam date must fall within the exam window");
    }
  }
  const { data: subject, error: subError } = await db
    .from("subjects")
    .select("id")
    .eq("id", input.subjectId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (subError !== null || subject === null) {
    throw new NotFoundError("Subject not found in this school");
  }
  const { data, error } = await db
    .from("exam_subjects")
    .insert({
      school_id: ctx.profile.schoolId,
      exam_id: examId,
      subject_id: input.subjectId,
      max_marks: input.maxMarks,
      passing_marks: input.passingMarks,
      exam_date: input.examDate ?? null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "exam.subject_added", "exam_subjects", id, {
    examId,
    subjectId: input.subjectId,
  });
  return { id };
}

/** Admin only. Re-validates the merged configuration. */
export async function updateExamSubject(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
  patch: ExamSubjectUpdateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: existing, error: existingError } = await db
    .from("exam_subjects")
    .select("id, max_marks, passing_marks, start_time, end_time, exam_date, exam_id")
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(existingError, "Exam subject not found");
  const row = existing as {
    id: string;
    max_marks: number;
    passing_marks: number;
    start_time: string | null;
    end_time: string | null;
    exam_date: string | null;
    exam_id: string;
  };
  const merged = {
    maxMarks: patch.maxMarks ?? row.max_marks,
    passingMarks: patch.passingMarks ?? row.passing_marks,
    startTime: patch.startTime ?? row.start_time ?? undefined,
    endTime: patch.endTime ?? row.end_time ?? undefined,
  };
  const problem = validateExamSubjectConfig(merged);
  if (problem !== null) throw new ConflictError(problem);
  const newDate = patch.examDate ?? row.exam_date;
  if (newDate !== null) {
    const { data: exam, error: examError } = await db
      .from("exams")
      .select("starts_on, ends_on")
      .eq("id", row.exam_id)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    throwForPostgrest(examError, "Exam not found");
    const window = exam as { starts_on: string; ends_on: string };
    if (newDate < window.starts_on || newDate > window.ends_on) {
      throw new ConflictError("Subject exam date must fall within the exam window");
    }
  }
  const update: Record<string, unknown> = {};
  if (patch.maxMarks !== undefined) update["max_marks"] = patch.maxMarks;
  if (patch.passingMarks !== undefined) update["passing_marks"] = patch.passingMarks;
  if (patch.examDate !== undefined) update["exam_date"] = patch.examDate;
  if (patch.startTime !== undefined) update["start_time"] = patch.startTime;
  if (patch.endTime !== undefined) update["end_time"] = patch.endTime;
  if (Object.keys(update).length === 0) return { id: examSubjectId };
  const { data, error } = await db
    .from("exam_subjects")
    .update(update)
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Exam subject not found");
  await logAudit(db, ctx, "exam.subject_updated", "exam_subjects", examSubjectId, {
    fields: Object.keys(update),
  });
  return { id: (data as { id: string }).id };
}

/** Admin only. */
export async function removeExamSubject(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("exam_subjects")
    .delete()
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Exam subject not found");
  await logAudit(db, ctx, "exam.subject_removed", "exam_subjects", examSubjectId, {});
  return { id: (data as { id: string }).id };
}

/* ------------------------------- schedules ------------------------------- */

/** Admin only. Upserts the 1:1 room/invigilator schedule for a subject exam. */
export async function upsertExamSchedule(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
  input: ExamScheduleInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { error: esError } = await db
    .from("exam_subjects")
    .select("id")
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(esError, "Exam subject not found");
  if (input.invigilatorId !== undefined && input.invigilatorId !== null) {
    const { data: teacher, error: tError } = await db
      .from("teachers")
      .select("id")
      .eq("id", input.invigilatorId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (tError !== null || teacher === null) {
      throw new NotFoundError("Invigilator not found in this school");
    }
  }
  const row = {
    school_id: ctx.profile.schoolId,
    exam_subject_id: examSubjectId,
    room: input.room ?? null,
    invigilator_id: input.invigilatorId ?? null,
  };
  const { data, error } = await db
    .from("exam_schedules")
    .upsert(row, { onConflict: "exam_subject_id" })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "exam.schedule_updated", "exam_schedules", id, {
    examSubjectId,
  });
  return { id };
}

/** Admin only. Removes the schedule row (date/time config untouched). */
export async function removeExamSchedule(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("exam_schedules")
    .delete()
    .eq("exam_subject_id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Schedule not found");
  await logAudit(db, ctx, "exam.schedule_removed", "exam_schedules", examSubjectId, {});
  return { id: (data as { id: string }).id };
}

/* ------------------------------ child schedule --------------------------- */

/** Exam schedule for one linked child (parent scope enforced). */
export async function listChildExamSchedule(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
): Promise<{ exams: ExamDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "PARENT"]);
  if (!isAdmin(ctx)) {
    const scope = await getParentScope(db, ctx);
    if (scope === null || !scope.studentIds.has(studentId)) {
      throw new TenantBoundaryError();
    }
  }
  const { data: student, error: studentError } = await db
    .from("students")
    .select("id, class_id")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(studentError, "Student not found");
  const classId = (student as { class_id: string | null }).class_id;
  if (classId === null) return { exams: [] };
  const { data, error } = await db
    .from("exams")
    .select(EXAM_COLUMNS)
    .eq("school_id", ctx.profile.schoolId)
    .eq("class_id", classId)
    .eq("is_active", true)
    .order("starts_on", { ascending: false });
  throwForPostgrest(error);
  const exams = toCamel<ExamDto[]>(data ?? []);
  if (exams.length === 0) return { exams: [] };
  const { data: subjects, error: subError } = await db
    .from("exam_subjects")
    .select(EXAM_SUBJECT_COLUMNS)
    .in(
      "exam_id",
      exams.map((e) => e.id),
    )
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(subError);
  const typedSubjects = toCamel<ExamSubjectDto[]>(subjects ?? []);
  return {
    exams: exams.map((e) => ({
      ...e,
      subjects: typedSubjects.filter((s) => s.examId === e.id),
    })),
  };
}
