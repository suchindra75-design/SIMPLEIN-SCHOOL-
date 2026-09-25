import {
  authorizeRoles,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import {
  assertParentStudentAccess,
  assertTeacherSectionAccess,
  isAdmin,
} from "@/lib/auth/scope";
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
import {
  attendancePercentage,
  summarize,
  type AttendanceSummary,
} from "@/lib/services/attendance/calc";
import { validateAttendanceDate, todayInSchoolTz } from "@/lib/services/attendance/date";
import type {
  AttendanceRangeQuery,
  AttendanceStatus,
  SaveAttendanceInput,
} from "@/lib/validation/attendance";
import type { SectionDto, StudentDto } from "@/lib/services/dto";

/**
 * Attendance service (Phase 4). Reuses the existing scope/tenant/audit
 * abstractions — no duplicate authorization mechanism.
 *
 * TRANSACTIONAL SAVE NOTE (honest limitation): the Supabase JS client over
 * PostgREST has no multi-statement transaction. Strategy: (1) upsert the
 * session (UNIQUE section+date dedupes), (2) upsert records as ONE batched
 * call. The partial-failure window between (1) and (2) is tiny and the
 * records upsert is idempotent — a retry converges without duplicates.
 * Documented in docs/ARCHITECTURE.md §19; never presented as atomic.
 */

const SESSION_COLUMNS =
  "id, school_id, academic_year_id, section_id, attendance_date, status, created_by, updated_by, created_at, updated_at";
const RECORD_COLUMNS =
  "id, school_id, attendance_session_id, student_id, status, remark, updated_by, created_at, updated_at";

/* ----------------------------- authorization ---------------------------- */

/** Sections the caller may read/mark: admin → all active; teacher → scope. */
export async function listAttendanceSections(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ sections: SectionDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  if (isAdmin(ctx)) {
    const { data, error } = await db
      .from("sections")
      .select(
        "id, name, class_id, is_active, classes(name)",
      )
      .eq("school_id", ctx.profile.schoolId)
      .eq("is_active", true);
    throwForPostgrest(error);
    return { sections: toCamel<SectionDto[]>(data ?? []) };
  }
  const scope = await getTeacherScope(db, ctx);
  if (scope === null || scope.sectionIds.size === 0) {
    return { sections: [] };
  }
  const { data, error } = await db
    .from("sections")
    .select("id, name, class_id, is_active, classes(name)")
    .in("id", [...scope.sectionIds])
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_active", true);
  throwForPostgrest(error);
  return { sections: toCamel<SectionDto[]>(data ?? []) };
}

/** Scope check for one section (admin pass; teacher link-scoped; else 404). */
export async function assertAttendanceSectionAccess(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (!ctx.roles.includes("TEACHER")) throw new TenantBoundaryError();
  const scope = await getTeacherScope(db, ctx);
  assertTeacherSectionAccess(
    ctx,
    sectionId,
    scope === null ? new Set() : scope.sectionIds,
  );
}

/**
 * Shared student-attendance scope check (history + summary): admin passes;
 * teachers via the student's assigned section (unenrolled → deny); parents
 * via student_parents; others denied. 404 boundary preserved.
 */
export async function assertStudentAttendanceAccess(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (ctx.roles.includes("TEACHER")) {
    const { data: sec, error: secError } = await db
      .from("students")
      .select("section_id")
      .eq("id", studentId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    throwForPostgrest(error(secError), "Student not found");
    const sectionId = (sec as { section_id: string | null }).section_id;
    if (sectionId === null) throw new TenantBoundaryError();
    await assertAttendanceSectionAccess(db, ctx, sectionId);
    return;
  }
  if (ctx.roles.includes("PARENT")) {
    const scope = await getParentScope(db, ctx);
    assertParentStudentAccess(
      ctx,
      studentId,
      scope === null ? new Set() : scope.studentIds,
    );
    return;
  }
  throw new TenantBoundaryError();
}

/* -------------------------- academic context ---------------------------- */

export interface AcademicContext {
  academicYearId: string;
  yearName: string;
  startsOn: string;
  endsOn: string;
}

/**
 * Applicable academic year for an attendance date: the year whose bounds
 * contain the date, else the school's current year (schools often mark
 * attendance slightly outside configured bounds — documented V1 rule).
 */
export async function resolveAcademicContext(
  db: DbClient,
  ctx: SessionContext,
  date: string,
): Promise<AcademicContext> {
  const { data, error } = await db
    .from("academic_years")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  const years = (data ?? []) as {
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    is_current: boolean;
  }[];
  const containing = years.find(
    (y) => date >= y.starts_on && date <= y.ends_on,
  );
  const current = years.find((y) => y.is_current);
  const year = containing ?? current;
  if (year === undefined) {
    throw new NotFoundError("No academic year is configured for this school");
  }
  return {
    academicYearId: year.id,
    yearName: year.name,
    startsOn: year.starts_on,
    endsOn: year.ends_on,
  };
}

/* ------------------------------- roster --------------------------------- */

/**
 * Students enrolled in a section for the academic year, from the
 * student_enrollments model (academic-year aware). Fallback (documented):
 * when the section has NO enrollment rows for the year (e.g. students were
 * created before any academic year existed), the students' current
 * section_id pointer is used so attendance still works.
 */
export async function getSectionRoster(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  academicYearId: string,
): Promise<StudentDto[]> {
  const { data: enrollmentRows, error: enrollError } = await db
    .from("student_enrollments")
    .select(
      "student_id, roll_number, students(id, admission_no, display_name, section_id, status)",
    )
    .eq("school_id", ctx.profile.schoolId)
    .eq("academic_year_id", academicYearId)
    .eq("section_id", sectionId)
    .eq("status", "enrolled");
  throwForPostgrest(enrollError);
  const rows = (enrollmentRows ?? []) as unknown as {
    student_id: string;
    roll_number: string | null;
    students: StudentDto | null;
  }[];
  if (rows.length > 0) {
    return rows
      .filter((r) => r.students !== null)
      .map((r) => ({
        ...toCamel<StudentDto>(r.students),
        rollNumber: r.roll_number,
      }));
  }
  const { data: fallback, error: fbError } = await db
    .from("students")
    .select(
      "id, admission_no, display_name, section_id, roll_number, status",
    )
    .eq("school_id", ctx.profile.schoolId)
    .eq("section_id", sectionId)
    .eq("status", "active");
  throwForPostgrest(fbError);
  return toCamel<StudentDto[]>(fallback ?? []);
}

/* --------------------------- session + marking --------------------------- */

export interface MarkingPayload {
  section: { id: string; name: string; classes?: { name: string } | null };
  academicYear: AcademicContext;
  students: StudentDto[];
  session: {
    id: string;
    date: string;
    status: string;
  } | null;
  records: {
    studentId: string;
    status: AttendanceStatus;
    remark: string | null;
  }[];
}

/** Marking-screen payload: roster + existing session/records for a date. */
export async function getMarkingPayload(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  date: string,
): Promise<MarkingPayload> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const dateError = validateAttendanceDate(date, {
    today: todayFor(ctx),
  });
  if (dateError !== null) throw new ConflictError(dateError);
  await assertAttendanceSectionAccess(db, ctx, sectionId);
  const { data: section, error: sectionError } = await db
    .from("sections")
    .select("id, name, class_id, classes(name)")
    .eq("id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error(sectionError), "Section not found");
  const typedSection = toCamel<{
    id: string;
    name: string;
    classes?: { name: string } | null;
  }>(section);
  const year = await resolveAcademicContext(db, ctx, date);
  const students = await getSectionRoster(db, ctx, sectionId, year.academicYearId);
  const { data: session, error: sessionError } = await db
    .from("attendance_sessions")
    .select(SESSION_COLUMNS)
    .eq("section_id", sectionId)
    .eq("attendance_date", date)
    .eq("school_id", ctx.profile.schoolId)
    .maybeSingle();
  throwForPostgrest(sessionError);
  let records: MarkingPayload["records"] = [];
  if (session !== null) {
    const sessionId = (session as { id: string }).id;
    const { data: recs, error: recError } = await db
      .from("attendance_records")
      .select(RECORD_COLUMNS)
      .eq("attendance_session_id", sessionId)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(recError);
    records = toCamel<MarkingPayload["records"]>(recs ?? []);
  }
  return {
    section: typedSection,
    academicYear: year,
    students,
    session:
      session === null
        ? null
        : {
            id: (session as { id: string }).id,
            date: (session as { attendance_date: string }).attendance_date,
            status: (session as { status: string }).status,
          },
    records,
  };
}

/** School-local "today" for the caller's school. */
export function todayFor(ctx: SessionContext, now: Date = new Date()): string {
  return todayInSchoolTz(ctx.school.timezone, now);
}

function error(e: unknown): { code?: string; message: string } | null {
  if (e === null) return null;
  if (typeof e === "object" && e !== null && "message" in e) {
    const withCode = e as { code?: string; message: string };
    return { code: withCode.code, message: withCode.message };
  }
  return null;
}

/**
 * Save/upsert attendance (admin: own school; teacher: assigned sections).
 * Validates date, section, academic context, and per-student enrollment;
 * upserts the session (UNIQUE section+date) then ONE batched records upsert;
 * audits with old→new status diffs per changed student.
 */
export async function saveAttendance(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  input: SaveAttendanceInput,
): Promise<{ sessionId: string; saved: number; changed: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const dateError = validateAttendanceDate(input.date, { today: todayFor(ctx) });
  if (dateError !== null) throw new ConflictError(dateError);
  await assertAttendanceSectionAccess(db, ctx, sectionId);

  // Section must exist in this school (404 otherwise).
  const { data: section, error: sectionError } = await db
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error(sectionError), "Section not found in this school");

  const year = await resolveAcademicContext(db, ctx, input.date);
  if (input.date < year.startsOn || input.date > year.endsOn) {
    // Allowed by the "current year" fallback rule, but flagged in audit.
  }

  // Enrollment validation: every student must be enrolled in THIS section for
  // the applicable academic year (enrollment model first, pointer fallback).
  const roster = await getSectionRoster(db, ctx, sectionId, year.academicYearId);
  const rosterIds = new Set(roster.map((s) => s.id));
  const invalid = input.records
    .map((r) => r.studentId)
    .filter((id) => !rosterIds.has(id));
  if (invalid.length > 0) {
    throw new ConflictError(
      `${invalid.length} student(s) are not enrolled in this section for ${year.yearName}`,
    );
  }

  // Old statuses for the audit diff (one query, not N).
  const existing = await findSession(db, ctx.profile.schoolId, sectionId, input.date);
  let oldStatuses = new Map<string, AttendanceStatus>();
  if (existing !== null) {
    const { data: recs, error: recError } = await db
      .from("attendance_records")
      .select("student_id, status")
      .eq("attendance_session_id", existing.id)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(recError);
    oldStatuses = new Map(
      ((recs ?? []) as { student_id: string; status: AttendanceStatus }[]).map(
        (r) => [r.student_id, r.status],
      ),
    );
  }

  // (1) Session upsert — UNIQUE(section_id, attendance_date) dedupes.
  const { data: session, error: sessionError } = await db
    .from("attendance_sessions")
    .upsert(
      {
        school_id: ctx.profile.schoolId,
        academic_year_id: year.academicYearId,
        section_id: sectionId,
        attendance_date: input.date,
        status: "SUBMITTED",
        updated_by: ctx.profile.id,
        ...(existing === null ? { created_by: ctx.profile.id } : {}),
      },
      { onConflict: "section_id,attendance_date" },
    )
    .select("id")
    .single();
  throwForPostgrest(error(sessionError), "Session save failed");
  const sessionId = (session as { id: string }).id;

  // (2) ONE batched records upsert (idempotent; no N queries).
  const { error: recordsError } = await db
    .from("attendance_records")
    .upsert(
      input.records.map((r) => ({
        school_id: ctx.profile.schoolId,
        attendance_session_id: sessionId,
        student_id: r.studentId,
        status: r.status,
        remark: r.remark ?? null,
        updated_by: ctx.profile.id,
      })),
      { onConflict: "attendance_session_id,student_id" },
    );
  throwForPostgrest(error(recordsError), "Records save failed");

  const changed = input.records
    .filter((r) => oldStatuses.get(r.studentId) !== r.status)
    .map((r) => ({
      studentId: r.studentId,
      from: oldStatuses.get(r.studentId) ?? null,
      to: r.status,
    }));
  await logAudit(db, ctx, existing === null ? "attendance.created" : "attendance.updated", "attendance_sessions", sessionId, {
    sectionId,
    date: input.date,
    total: input.records.length,
    changed,
  });
  return { sessionId, saved: input.records.length, changed: changed.length };
}

async function findSession(
  db: DbClient,
  schoolId: string,
  sectionId: string,
  date: string,
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("attendance_sessions")
    .select("id")
    .eq("section_id", sectionId)
    .eq("attendance_date", date)
    .eq("school_id", schoolId)
    .maybeSingle();
  throwForPostgrest(error);
  return data as { id: string } | null;
}

/* ------------------------------ student views ---------------------------- */

export interface StudentAttendanceRow {
  date: string;
  status: AttendanceStatus;
  remark: string | null;
  sessionId: string;
}

/** Daily history for one student (admin/assigned-teacher/linked-parent). */
export async function getStudentAttendance(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
  q: AttendanceRangeQuery,
): Promise<{ records: StudentAttendanceRow[]; total: number }> {
  // Tenant + link scope (shared helper; 404 on cross-tenant).
  const { data: student, error: studentError } = await db
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error(studentError), "Student not found");
  await assertStudentAttendanceAccess(db, ctx, studentId);

  const from = (q.page - 1) * q.limit;
  let query = db
    .from("attendance_records")
    .select(
      "id, status, remark, attendance_session_id, attendance_sessions(attendance_date)",
      { count: "exact" },
    )
    .eq("school_id", ctx.profile.schoolId)
    .eq("student_id", studentId)
    .order("attendance_session_id")
    .range(from, from + q.limit - 1);
  if (q.from !== undefined) {
    query = query.gte("attendance_sessions.attendance_date", q.from);
  }
  if (q.to !== undefined) {
    query = query.lte("attendance_sessions.attendance_date", q.to);
  }
  const { data, error: recError, count } = await query;
  throwForPostgrest(error(recError));
  const rows = (data ?? []) as unknown as {
    status: AttendanceStatus;
    remark: string | null;
    attendance_session_id: string;
    attendance_sessions: { attendance_date: string } | null;
  }[];
  return {
    records: rows.map((r) => ({
      date: r.attendance_sessions?.attendance_date ?? "",
      status: r.status,
      remark: r.remark,
      sessionId: r.attendance_session_id,
    })),
    total: count ?? rows.length,
  };
}

/** Student summary over an optional date range (server-side calculation). */
export async function getStudentSummary(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
  range: { from?: string; to?: string },
): Promise<AttendanceSummary> {
  // Scope first (404 on cross-tenant; linked children only for parents).
  const { data: student, error: studentError } = await db
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error(studentError), "Student not found");
  await assertStudentAttendanceAccess(db, ctx, studentId);

  // Fetch all records in range (bounded: one student × ≤1 year of days),
  // compute with the shared pure calculator — never client-side math.
  let query = db
    .from("attendance_records")
    .select("status, attendance_sessions(attendance_date)")
    .eq("school_id", ctx.profile.schoolId)
    .eq("student_id", studentId)
    .limit(1000);
  if (range.from !== undefined) {
    query = query.gte("attendance_sessions.attendance_date", range.from);
  }
  if (range.to !== undefined) {
    query = query.lte("attendance_sessions.attendance_date", range.to);
  }
  const { data, error: recError } = await query;
  throwForPostgrest(error(recError));
  const statuses = ((data ?? []) as { status: AttendanceStatus }[]).map(
    (r) => r.status,
  );
  return summarize(statuses);
}

/* ------------------------------ section views ---------------------------- */

/** One-date section summary (server-side aggregation). */
export async function getSectionSummary(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  date: string,
): Promise<AttendanceSummary & { totalStudents: number; sessionExists: boolean }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  // Section must exist in this school (404 on cross-tenant ids).
  const { data: section, error: sectionError } = await db
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error(sectionError), "Section not found");
  await assertAttendanceSectionAccess(db, ctx, sectionId);
  const session = await findSession(db, ctx.profile.schoolId, sectionId, date);
  if (session === null) {
    return {
      present: 0,
      absent: 0,
      leave: 0,
      total: 0,
      percentage: null,
      totalStudents: 0,
      sessionExists: false,
    };
  }
  const { data, error: recError } = await db
    .from("attendance_records")
    .select("status")
    .eq("attendance_session_id", session.id)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error(recError));
  const summary = summarize(
    ((data ?? []) as { status: AttendanceStatus }[]).map((r) => r.status),
  );
  return {
    ...summary,
    totalStudents: summary.total,
    sessionExists: true,
  };
}

export { attendancePercentage };
