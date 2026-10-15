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
import { gradeFor, type GradingRule } from "@/lib/services/grades/calc";
import { getParentScope } from "@/lib/services/parents";
import { getTeacherScope } from "@/lib/services/teachers";
import type {
  ExamSubjectStateDto,
  GradingSystemDto,
  MarkRowDto,
  StudentResultDto,
} from "@/lib/services/dto";
import type { SaveMarksInput } from "@/lib/validation/marks";

/**
 * Marks + results service (Phase 6). Reuses the existing scope/tenant/audit
 * abstractions. Result states on exam_subjects: is_locked (teacher edits
 * rejected; admin corrections/unlock only) and is_published (parents see
 * published results only). Grade calculation is server-side via the school's
 * configurable grading rules — never client-side math.
 */

const MARK_COLUMNS =
  "id, school_id, exam_subject_id, student_id, marks_obtained, is_absent, grade, version, updated_by";
const SUBJECT_STATE_COLUMNS =
  "id, school_id, exam_id, subject_id, max_marks, passing_marks, exam_date, start_time, end_time, is_locked, is_published, subjects(name, code)";

/* ------------------------------ access helpers -------------------------- */

/**
 * Sections whose marks the caller may enter for an exam subject: null = every
 * section (admin). A teacher gets the sections of the exam's class where they
 * are the class teacher (all subjects) or are assigned THIS subject; an empty
 * set means no access. Marks are per student, so the roster, the grid and the
 * save are all limited to these sections.
 */
export async function markableSectionIds(
  db: DbClient,
  ctx: SessionContext,
  examSubject: { subjectId: string; examId: string },
): Promise<Set<string> | null> {
  if (isAdmin(ctx)) return null;
  if (!ctx.roles.includes("TEACHER")) return new Set();
  const scope = await getTeacherScope(db, ctx);
  if (scope === null || scope.sectionIds.size === 0) return new Set();
  const { data: exam, error: examError } = await db
    .from("exams")
    .select("class_id")
    .eq("id", examSubject.examId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(examError, "Exam not found");
  const classId = (exam as { class_id: string }).class_id;
  const { data: sections, error: secError } = await db
    .from("sections")
    .select("id, class_teacher_id")
    .in("id", [...scope.sectionIds])
    .eq("class_id", classId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(secError);
  const inClass = sections as { id: string; class_teacher_id: string | null }[];
  if (inClass.length === 0) return new Set();
  const { data: ts, error: tsError } = await db
    .from("teacher_subjects")
    .select("section_id")
    .eq("teacher_id", scope.teacherId)
    .eq("subject_id", examSubject.subjectId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(tsError);
  const assigned = new Set((ts as { section_id: string }[]).map((r) => r.section_id));
  return new Set(
    inClass
      .filter((s) => s.class_teacher_id === scope.teacherId || assigned.has(s.id))
      .map((s) => s.id),
  );
}

/** Teacher may enter marks for an exam subject in at least one section. Admin passes. */
export async function teacherCanEnterMarks(
  db: DbClient,
  ctx: SessionContext,
  examSubject: { subjectId: string; examId: string },
): Promise<boolean> {
  const sections = await markableSectionIds(db, ctx, examSubject);
  return sections === null || sections.size > 0;
}

/** Scope check for one exam subject (404 boundary; also fetches state). */
export async function getExamSubjectState(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
): Promise<ExamSubjectStateDto> {
  const { data, error } = await db
    .from("exam_subjects")
    .select(SUBJECT_STATE_COLUMNS)
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Exam subject not found");
  return toCamel<ExamSubjectStateDto>(data);
}

/** Authorization + locked-state gate for reading the marks grid. */
export async function assertMarksReadAccess(
  db: DbClient,
  ctx: SessionContext,
  examSubject: ExamSubjectStateDto,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (!ctx.roles.includes("TEACHER")) throw new TenantBoundaryError();
  const allowed = await teacherCanEnterMarks(db, ctx, examSubject);
  if (!allowed) throw new TenantBoundaryError();
}

/** Enrollment roster for the exam's class + year (enrollment model first). */
export async function getClassRoster(
  db: DbClient,
  ctx: SessionContext,
  classId: string,
  academicYearId: string,
  /** Limit to these sections (null/undefined = whole class). */
  sectionIds?: ReadonlySet<string> | null,
): Promise<{ id: string; displayName: string; admissionNo: string; rollNumber: string | null }[]> {
  if (sectionIds != null && sectionIds.size === 0) return [];
  let enrollQuery = db
    .from("student_enrollments")
    .select(
      "student_id, roll_number, students(id, admission_no, display_name, class_id, status)",
    )
    .eq("school_id", ctx.profile.schoolId)
    .eq("academic_year_id", academicYearId)
    .eq("class_id", classId)
    .eq("status", "enrolled");
  if (sectionIds != null) enrollQuery = enrollQuery.in("section_id", [...sectionIds]);
  const { data: enrollmentRows, error: enrollError } = await enrollQuery;
  throwForPostgrest(enrollError);
  const rows = (enrollmentRows ?? []) as unknown as {
    student_id: string;
    roll_number: string | null;
    students: { id: string; admission_no: string; display_name: string } | null;
  }[];
  if (rows.length > 0) {
    return rows.flatMap((r) =>
      r.students == null
        ? []
        : [
            {
              id: r.students.id,
              displayName: r.students.display_name,
              admissionNo: r.students.admission_no,
              rollNumber: r.roll_number,
            },
          ],
    );
  }
  let fallbackQuery = db
    .from("students")
    .select("id, admission_no, display_name, roll_number")
    .eq("school_id", ctx.profile.schoolId)
    .eq("class_id", classId)
    .eq("status", "active");
  if (sectionIds != null) fallbackQuery = fallbackQuery.in("section_id", [...sectionIds]);
  const { data: fallback, error: fbError } = await fallbackQuery;
  throwForPostgrest(fbError);
  return toCamel(fallback ?? []);
}

/* ------------------------------ marks grid + save ------------------------ */

/** Markable exam subjects for the caller (admin → all; teacher → authorized). */
export async function listMarkableSubjects(
  db: DbClient,
  ctx: SessionContext,
  examId: string,
): Promise<{ subjects: ExamSubjectStateDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const { data: exam, error: examError } = await db
    .from("exams")
    .select("id")
    .eq("id", examId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(examError, "Exam not found");
  void exam;
  const { data, error } = await db
    .from("exam_subjects")
    .select(SUBJECT_STATE_COLUMNS)
    .eq("exam_id", examId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  const all = toCamel<ExamSubjectStateDto[]>(data ?? []);
  if (isAdmin(ctx)) return { subjects: all };
  if (!ctx.roles.includes("TEACHER")) return { subjects: [] };
  const checks = await Promise.all(
    all.map((s) => teacherCanEnterMarks(db, ctx, s)),
  );
  return { subjects: all.filter((_, i) => checks[i]) };
}

export interface MarksGrid {
  examSubject: ExamSubjectStateDto;
  exam: { id: string; name: string; classId: string; classes?: { name: string } | null };
  roster: { id: string; displayName: string; admissionNo: string; rollNumber: string | null }[];
  marks: MarkRowDto[];
}

/** Marks entry grid: roster + existing marks + subject state (scoped). */
export async function getMarksGrid(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
): Promise<MarksGrid> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const examSubject = await getExamSubjectState(db, ctx, examSubjectId);
  await assertMarksReadAccess(db, ctx, examSubject);
  const { data: exam, error: examError } = await db
    .from("exams")
    .select("id, name, class_id, academic_year_id, classes(name)")
    .eq("id", examSubject.examId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(examError, "Exam not found");
  const typedExam = toCamel<{
    id: string;
    name: string;
    classId: string;
    academicYearId: string;
    classes?: { name: string } | null;
  }>(exam);
  const sectionIds = await markableSectionIds(db, ctx, examSubject);
  const roster = await getClassRoster(
    db,
    ctx,
    typedExam.classId,
    typedExam.academicYearId,
    sectionIds,
  );
  let marksQuery = db
    .from("marks")
    .select(MARK_COLUMNS)
    .eq("exam_subject_id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId);
  if (sectionIds !== null) marksQuery = marksQuery.in("student_id", roster.map((r) => r.id));
  const { data: marks, error: marksError } = await marksQuery;
  throwForPostgrest(marksError);
  return {
    examSubject,
    exam: typedExam,
    roster,
    marks: toCamel<MarkRowDto[]>(marks ?? []),
  };
}

/**
 * Bulk save marks (upsert; ONE batched call). Validates marks bounds and
 * enrollment; teacher edits rejected when locked (409); grade computed
 * server-side from the school's default grading rules; audited with diffs.
 */
export async function saveMarks(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
  input: SaveMarksInput,
): Promise<{ saved: number; changed: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const examSubject = await getExamSubjectState(db, ctx, examSubjectId);
  await assertMarksReadAccess(db, ctx, examSubject);
  if (examSubject.isLocked && !isAdmin(ctx)) {
    throw new ConflictError("Marks are locked — ask your administrator to unlock them");
  }

  // Enrollment validation (DB trigger backstops): roster of the exam's class/year.
  const { data: exam, error: examError } = await db
    .from("exams")
    .select("id, class_id, academic_year_id")
    .eq("id", examSubject.examId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(examError, "Exam not found");
  const examRow = exam as { id: string; class_id: string; academic_year_id: string };
  const sectionIds = await markableSectionIds(db, ctx, examSubject);
  const roster = await getClassRoster(db, ctx, examRow.class_id, examRow.academic_year_id, sectionIds);
  const rosterIds = new Set(roster.map((s) => s.id));
  const invalid = input.records
    .map((r) => r.studentId)
    .filter((id) => !rosterIds.has(id));
  if (invalid.length > 0) {
    throw new ConflictError(
      sectionIds === null
        ? `${invalid.length} student(s) are not enrolled in the exam's class for this academic year`
        : `${invalid.length} student(s) are not in a section you can enter marks for`,
    );
  }

  // Old values for the audit diff (one query, not N).
  const { data: existing, error: existError } = await db
    .from("marks")
    .select("id, student_id, marks_obtained, is_absent, version, entered_by")
    .eq("exam_subject_id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(existError);
  const oldRows = (existing ?? []) as {
    id: string;
    student_id: string;
    marks_obtained: number | null;
    is_absent: boolean;
    version: number;
    entered_by: string | null;
  }[];
  // Value snapshot (not row references): the diff must reflect pre-save state.
  const oldByStudent = new Map(
    oldRows.map((r) => [
      r.student_id,
      {
        marks_obtained: r.marks_obtained,
        is_absent: r.is_absent,
        version: r.version,
        entered_by: r.entered_by,
      },
    ]),
  );

  // Optimistic locking: reject stale saves.
  if (input.version !== undefined) {
    for (const r of oldRows) {
      if (r.version !== input.version) {
        throw new ConflictError("Marks were updated by someone else — reload and retry");
      }
    }
  }

  // Grade per record from the school's default grading rules.
  const rules = await defaultGradingRules(db, ctx);

  const { error: upsertError } = await db.from("marks").upsert(
    input.records.map((r) => {
      const max = examSubject.maxMarks;
      const obtained =
        r.isAbsent === true ? null : (r.marksObtained ?? null);
      if (obtained !== null && (obtained < 0 || obtained > max)) {
        throw new ConflictError(
          `Marks must be between 0 and ${max}`,
        );
      }
      const percentage =
        obtained === null
          ? null
          : Math.round((obtained / max) * 10000) / 100;
      const grade =
        percentage === null ? null : gradeFor(percentage, rules).grade;
      return {
        school_id: ctx.profile.schoolId,
        exam_subject_id: examSubjectId,
        student_id: r.studentId,
        marks_obtained: obtained,
        is_absent: r.isAbsent,
        grade,
        updated_by: ctx.profile.id,
        // Always sent: a bulk upsert uses the union of keys, so omitting it on
        // existing rows would overwrite their original author with NULL.
        entered_by: oldByStudent.get(r.studentId)?.entered_by ?? ctx.profile.id,
      };
    }),
    { onConflict: "exam_subject_id,student_id" },
  );
  throwForPostgrest(upsertError);

  const changed = input.records
    .map((r) => {
      const old = oldByStudent.get(r.studentId);
      return {
        studentId: r.studentId,
        from: old === undefined ? null : (old.marks_obtained ?? "ABSENT"),
        to: r.isAbsent === true ? ("ABSENT" as const) : (r.marksObtained ?? null),
      };
    })
    .filter((c) => c.from !== c.to);
  await logAudit(db, ctx, "marks.saved", "marks", examSubjectId, {
    examSubjectId,
    total: input.records.length,
    changed,
    locked: examSubject.isLocked,
  });
  return { saved: input.records.length, changed: changed.length };
}

/* ------------------------------ lock + publish --------------------------- */

/** Admin only, audited. Freezes marks entry for the subject. */
export async function setMarksLocked(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
  locked: boolean,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("exam_subjects")
    .update({ is_locked: locked })
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Exam subject not found");
  await logAudit(db, ctx, locked ? "marks.locked" : "marks.unlocked", "exam_subjects", examSubjectId, {});
  return { id: (data as { id: string }).id };
}

/** Admin only, audited. Makes results visible to parents (read-only). */
export async function setResultsPublished(
  db: DbClient,
  ctx: SessionContext,
  examSubjectId: string,
  published: boolean,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("exam_subjects")
    .update({ is_published: published })
    .eq("id", examSubjectId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Exam subject not found");
  await logAudit(db, ctx, published ? "results.published" : "results.unpublished", "exam_subjects", examSubjectId, {});
  return { id: (data as { id: string }).id };
}

/* ------------------------------ results ---------------------------------- */

/** Pure result calculation for one student over exam subject rows. */
export function calculateResult(
  student: { id: string; displayName: string; admissionNo: string },
  subjectRows: {
    subjectId: string;
    subjectName: string;
    marksObtained: number | null;
    maxMarks: number;
    isAbsent: boolean;
    grade: string | null;
  }[],
  rules: readonly GradingRule[],
): Omit<StudentResultDto, "published"> {
  // Documented rule: absent subjects contribute 0 to the total but their full
  // max to maxTotal (absence counts against — consistent with attendance).
  // When NO marks exist at all (nothing assessed), percentage/grade are null
  // — "not yet assessed", never a misleading 0%.
  const hasAnyMarks = subjectRows.some(
    (s) => !s.isAbsent && s.marksObtained !== null,
  );
  const totalObtained = subjectRows.reduce(
    (sum, s) => sum + (s.isAbsent || s.marksObtained === null ? 0 : s.marksObtained),
    0,
  );
  const maxTotal = subjectRows.reduce((sum, s) => sum + s.maxMarks, 0);
  const percentage =
    !hasAnyMarks || maxTotal === 0
      ? null
      : Math.round((totalObtained / maxTotal) * 10000) / 100;
  const overall = percentage === null ? { grade: null } : gradeFor(percentage, rules);
  return {
    studentId: student.id,
    displayName: student.displayName,
    admissionNo: student.admissionNo,
    subjects: subjectRows,
    totalObtained,
    maxTotal,
    percentage,
    overallGrade: overall.grade,
  };
}

/**
 * Student result for an exam. Parents see PUBLISHED results only (the whole
 * result is withheld when any subject is unpublished — 404 boundary).
 */
export async function getStudentResult(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
  examId: string,
): Promise<StudentResultDto> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { data: student, error: studentError } = await db
    .from("students")
    .select("id, display_name, admission_no")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(studentError, "Student not found");
  const { data: exam, error: examError } = await db
    .from("exams")
    .select("id, class_id")
    .eq("id", examId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(examError, "Exam not found");
  const examRow = exam as { id: string; class_id: string };

  let published: boolean;
  // Results are published per subject. `published` = every subject published;
  // parents/students see the result once any subject is published, limited to
  // the published subjects (matching marks RLS, exam_subject_is_published).
  const publishedSubjectIds = new Set<string>();
  {
    const { data: states, error: stError } = await db
      .from("exam_subjects")
      .select("id, is_published")
      .eq("exam_id", examId)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(stError);
    const rows = (states ?? []) as { id: string; is_published: boolean }[];
    for (const r of rows) if (r.is_published) publishedSubjectIds.add(r.id);
    published = rows.length > 0 && publishedSubjectIds.size === rows.length;
  }
  const familyView = !isAdmin(ctx) && !ctx.roles.includes("TEACHER");
  if (!isAdmin(ctx)) {
    if (ctx.roles.includes("TEACHER")) {
      // Teacher scope: an assigned section in the exam's class.
      const scope = await getTeacherScope(db, ctx);
      if (scope === null || scope.sectionIds.size === 0) {
        throw new TenantBoundaryError();
      }
      const { data: sections, error: secError } = await db
        .from("sections")
        .select("id")
        .in("id", [...scope.sectionIds])
        .eq("class_id", examRow.class_id)
        .eq("school_id", ctx.profile.schoolId);
      throwForPostgrest(secError);
      if ((sections ?? []).length === 0) throw new TenantBoundaryError();
    } else if (ctx.roles.includes("PARENT")) {
      const scope = await getParentScope(db, ctx);
      if (scope === null || !scope.studentIds.has(studentId)) {
        throw new TenantBoundaryError();
      }
      // Published-only: parents never see unpublished subjects.
      if (publishedSubjectIds.size === 0) throw new NotFoundError("Results are not published yet");
    } else if (ctx.roles.includes("STUDENT")) {
      // Student: own results only, published-only.
      const { getStudentScope } = await import("@/lib/services/students");
      const scope = await getStudentScope(db, ctx);
      if (scope === null || scope.studentId !== studentId) {
        throw new TenantBoundaryError();
      }
      if (publishedSubjectIds.size === 0) throw new NotFoundError("Results are not published yet");
    } else {
      throw new TenantBoundaryError();
    }
  }

  const { data: subjects, error: subError } = await db
    .from("exam_subjects")
    .select("id, subject_id, max_marks, subjects(name)")
    .eq("exam_id", examId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(subError);
  const subjectRowsRaw = ((subjects ?? []) as unknown as {
    id: string;
    subject_id: string;
    max_marks: number;
    subjects: { name: string } | null;
  }[]).filter((s) => !familyView || publishedSubjectIds.has(s.id));
  const { data: marks, error: marksError } = await db
    .from("marks")
    .select("exam_subject_id, marks_obtained, is_absent, grade")
    .eq("student_id", studentId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(marksError);
  const marksBySubject = new Map(
    ((marks ?? []) as {
      exam_subject_id: string;
      marks_obtained: number | null;
      is_absent: boolean;
      grade: string | null;
    }[]).map((m) => [m.exam_subject_id, m]),
  );
  const rules = await defaultGradingRules(db, ctx);
  const result = calculateResult(
    {
      id: (student as { id: string }).id,
      displayName: (student as { display_name: string }).display_name,
      admissionNo: (student as { admission_no: string }).admission_no,
    },
    subjectRowsRaw.map((s) => {
      const m = marksBySubject.get(s.id);
      return {
        subjectId: s.subject_id,
        subjectName: s.subjects?.name ?? "Subject",
        marksObtained: m?.marks_obtained ?? null,
        maxMarks: s.max_marks,
        isAbsent: m?.is_absent ?? false,
        grade: m?.grade ?? null,
      };
    }),
    rules,
  );
  return { ...result, published };
}

/* ------------------------------ grading systems --------------------------- */

async function defaultGradingRules(
  db: DbClient,
  ctx: SessionContext,
): Promise<GradingRule[]> {
  const { data: system, error: sysError } = await db
    .from("grading_systems")
    .select("id")
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_default", true)
    .maybeSingle();
  if (sysError !== null) throw new Error(sysError.message);
  if (system === null) return [];
  const systemId = (system as { id: string }).id;
  const { data: rules, error: rulesError } = await db
    .from("grading_rules")
    .select("min_percentage, max_percentage, grade, grade_point")
    .eq("grading_system_id", systemId)
    .eq("school_id", ctx.profile.schoolId);
  if (rulesError !== null) throw new Error(rulesError.message);
  return ((rules ?? []) as {
    min_percentage: number;
    max_percentage: number;
    grade: string;
    grade_point: number | null;
  }[]).map((r) => ({
    minPercentage: r.min_percentage,
    maxPercentage: r.max_percentage,
    grade: r.grade,
    gradePoint: r.grade_point,
  }));
}

export async function listGradingSystems(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ systems: GradingSystemDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("grading_systems")
    .select(
      "id, name, is_default, grading_rules(id, min_percentage, max_percentage, grade, grade_point, remark_template)",
    )
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  return { systems: toCamel<GradingSystemDto[]>(data ?? []) };
}
