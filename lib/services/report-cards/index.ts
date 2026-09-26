import { authorizeRoles, TenantBoundaryError, type SessionContext } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { getStudentResult } from "@/lib/services/marks";
import { getStudentSummary } from "@/lib/services/attendance";
import { getParentScope } from "@/lib/services/parents";
import { getTeacherScope } from "@/lib/services/teachers";
import type { ReportCardDto } from "@/lib/services/dto";
import {
  generateReportCardPdf,
  type ReportCardPdfData,
} from "@/lib/services/report-cards/pdf";

/**
 * Report cards service (Phase 7). REUSES the existing result calculation
 * (getStudentResult) and attendance summary (getStudentSummary) — no
 * duplicated grade/result math. The PDF is generated server-side (pdf-lib),
 * stored in the private `report-cards` bucket (tenant-prefixed path,
 * signed access only), and never exposed via public URLs.
 */

const REPORT_CARD_COLUMNS =
  "id, school_id, exam_id, student_id, grading_system_id, total_obtained, max_total, percentage, cgpa, overall_grade, attendance_percentage, remarks, pdf_path, status, created_at";

/**
 * Student-level access check (teachers: the student's section must be in
 * their assigned scope; parents: student_parents link). Admin passes.
 */
async function assertReportCardAccess(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (ctx.roles.includes("TEACHER")) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null) throw new TenantBoundaryError();
    const { data: sec, error: secError } = await db
      .from("students")
      .select("section_id")
      .eq("id", studentId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    throwForPostgrest(secError, "Student not found");
    const sectionId = (sec as { section_id: string | null }).section_id;
    if (sectionId === null || !scope.sectionIds.has(sectionId)) {
      throw new TenantBoundaryError();
    }
    return;
  }
  if (ctx.roles.includes("PARENT")) {
    const scope = await getParentScope(db, ctx);
    if (scope === null || !scope.studentIds.has(studentId)) {
      throw new TenantBoundaryError();
    }
    return;
  }
  throw new TenantBoundaryError();
}

/** Full report-card payload (JSON preview + PDF source). */
export interface ReportCardPayload {
  reportCard: {
    id: string | null;
    status: string;
    totalObtained: number;
    maxTotal: number;
    percentage: number | null;
    cgpa: number | null;
    overallGrade: string | null;
    attendancePercentage: number | null;
    remarks: string | null;
  };
  school: { name: string; primaryColor: string | null };
  student: {
    id: string;
    name: string;
    admissionNo: string;
    className: string;
    sectionName: string | null;
  };
  academicYear: string;
  exam: { id: string; name: string };
  subjects: {
    subjectId: string;
    subjectName: string;
    marksObtained: number | null;
    maxMarks: number;
    isAbsent: boolean;
    grade: string | null;
  }[];
  attendance: {
    present: number;
    absent: number;
    leave: number;
    total: number;
    percentage: number | null;
  };
  published: boolean;
}

/**
 * Build (preview) the report card for a student + exam. Parent access is
 * PUBLISHED-only (getStudentResult enforces it live); teacher scope enforced
 * by getStudentResult; admin own school. No snapshot row is written.
 */
export async function buildReportCard(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
  examId: string,
): Promise<ReportCardPayload> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  // Reuse the Phase 6 result calculation (tenant + scope + publish gating).
  const result = await getStudentResult(db, ctx, studentId, examId);

  // Student class/section + exam + academic year (already tenant-scoped).
  const { data: studentRow, error: studentError } = await db
    .from("students")
    .select("id, class_id, section_id, classes(name), sections(name)")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(studentError, "Student not found");
  const student = toCamel<{
    classId: string | null;
    sectionId: string | null;
    classes?: { name: string } | null;
    sections?: { name: string } | null;
  }>(studentRow);
  const { data: examRow, error: examError } = await db
    .from("exams")
    .select("id, name, academic_year_id, academic_years(name)")
    .eq("id", examId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(examError, "Exam not found");
  const exam = toCamel<{
    name: string;
    academicYearId: string;
    academicYears?: { name: string } | null;
  }>(examRow);
  const { data: yearRow, error: yearError } = await db
    .from("academic_years")
    .select("name")
    .eq("id", exam.academicYearId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(yearError, "Academic year not found");

  // Reuse the Phase 4 attendance summary (existing calculation).
  const attendance = await getStudentSummary(db, ctx, studentId, {});

  // Existing snapshot (remarks/attendance persisted from a prior generation).
  const { data: snapshot, error: snapError } = await db
    .from("report_cards")
    .select(REPORT_CARD_COLUMNS)
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .maybeSingle();
  throwForPostgrest(snapError);
  const snap = toCamel<ReportCardDto | null>(snapshot);

  return {
    reportCard: {
      id: snap?.id ?? null,
      status: snap?.status ?? (result.published ? "PUBLISHED" : "DRAFT"),
      totalObtained: result.totalObtained,
      maxTotal: result.maxTotal,
      percentage: result.percentage,
      cgpa: snap?.cgpa ?? null,
      overallGrade: result.overallGrade,
      attendancePercentage: attendance.percentage,
      remarks: snap?.remarks ?? null,
    },
    school: { name: ctx.school.name, primaryColor: ctx.school.primaryColor },
    student: {
      id: result.studentId,
      name: result.displayName,
      admissionNo: result.admissionNo,
      className: student.classes?.name ?? "-",
      sectionName: student.sections?.name ?? null,
    },
    academicYear: (yearRow as { name: string }).name,
    exam: { id: examId, name: exam.name },
    subjects: result.subjects,
    attendance,
    published: result.published,
  };
}

/** Admin-only storage path for a generated PDF (tenant-prefixed). */
function pdfPath(schoolId: string, studentId: string, examId: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `schools/${schoolId}/report-cards/${examId}/${studentId}_${Date.now()}_${rand}.pdf`;
}

/**
 * Generate (or regenerate) the snapshot + PDF. Admin only, audited. The PDF
 * upload goes through the caller's user-context client — storage RLS
 * restricts writes to school admins; never the service role.
 */
export async function generateReportCard(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
  examId: string,
): Promise<{ id: string; status: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const payload = await buildReportCard(db, ctx, studentId, examId);
  const status = payload.published ? "PUBLISHED" : "DRAFT";

  const bytes = await generateReportCardPdf({
    schoolName: payload.school.name,
    primaryColor: payload.school.primaryColor,
    studentName: payload.student.name,
    admissionNo: payload.student.admissionNo,
    className: payload.student.className,
    sectionName: payload.student.sectionName,
    academicYear: payload.academicYear,
    examName: payload.exam.name,
    subjects: payload.subjects.map((s) => ({
      subjectName: s.subjectName,
      marksObtained: s.marksObtained,
      maxMarks: s.maxMarks,
      isAbsent: s.isAbsent,
      grade: s.grade,
    })),
    totalObtained: payload.reportCard.totalObtained,
    maxTotal: payload.reportCard.maxTotal,
    percentage: payload.reportCard.percentage,
    overallGrade: payload.reportCard.overallGrade,
    attendance: {
      present: payload.attendance.present,
      absent: payload.attendance.absent,
      leave: payload.attendance.leave,
      percentage: payload.attendance.percentage,
    },
    remarks: payload.reportCard.remarks,
    status,
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  });

  const path = pdfPath(ctx.profile.schoolId, studentId, examId);
  const { error: uploadError } = await db.storage
    .from("report-cards")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError !== null) {
    throw new Error(`report_card_upload_failed: ${uploadError.message}`);
  }

  const { data: row, error: upsertError } = await db
    .from("report_cards")
    .upsert(
      {
        school_id: ctx.profile.schoolId,
        exam_id: examId,
        student_id: studentId,
        total_obtained: payload.reportCard.totalObtained,
        max_total: payload.reportCard.maxTotal,
        percentage: payload.reportCard.percentage,
        overall_grade: payload.reportCard.overallGrade,
        attendance_percentage: payload.reportCard.attendancePercentage,
        status,
        pdf_path: path,
        generated_by: ctx.profile.id,
      },
      { onConflict: "exam_id,student_id" },
    )
    .select("id")
    .single();
  if (upsertError !== null || row === null) {
    // Best-effort cleanup: don't strand an orphan PDF.
    await db.storage.from("report-cards").remove([path]).catch(() => undefined);
    throw new Error(`report_card_save_failed: ${upsertError?.message}`);
  }
  const id = (row as { id: string }).id;
  await logAudit(db, ctx, "report_card.generated", "report_cards", id, {
    studentId,
    examId,
    status,
  });
  return { id, status };
}

/** Short-lived signed PDF URL (caller must already be authorized). */
export async function getReportCardPdfUrl(
  db: DbClient,
  ctx: SessionContext,
  reportCardId: string,
): Promise<string> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("report_cards")
    .select(REPORT_CARD_COLUMNS)
    .eq("id", reportCardId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Report card not found");
  const row = toCamel<ReportCardDto>(data);
  if (ctx.roles.includes("PARENT") && row.status !== "PUBLISHED") {
    throw new NotFoundError("Report card is not published yet");
  }
  await assertReportCardAccess(db, ctx, row.studentId);
  if (row.pdfPath === null) {
    throw new NotFoundError("Report card PDF has not been generated yet");
  }
  const { data: signed, error: urlError } = await db.storage
    .from("report-cards")
    .createSignedUrl(row.pdfPath, 600);
  if (urlError !== null || signed === null) {
    throw new Error(`report_card_url_failed: ${urlError?.message ?? "unknown"}`);
  }
  return signed.signedUrl;
}

export interface ReportCardListItemDto extends ReportCardDto {
  students?: { displayName: string; admissionNo: string; sectionId: string | null } | null;
}

/** Report cards generated for an exam (admin/teacher), with student names. */
export async function listReportCards(
  db: DbClient,
  ctx: SessionContext,
  examId: string,
): Promise<{ reportCards: ReportCardListItemDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const { data, error } = await db
    .from("report_cards")
    .select(`${REPORT_CARD_COLUMNS}, students(id, display_name, admission_no, section_id)`)
    .eq("exam_id", examId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  const rows = toCamel<ReportCardListItemDto[]>(data ?? []);
  if (isAdmin(ctx)) return { reportCards: rows };
  // Teacher: student-level scope — only students in assigned sections.
  const scope = await getTeacherScope(db, ctx);
  if (scope === null) return { reportCards: [] };
  const filtered = rows.flatMap((r) => {
    const sectionId = r.students?.sectionId;
    if (sectionId !== null && sectionId !== undefined && scope.sectionIds.has(sectionId)) {
      return [r];
    }
    return [];
  });
  return { reportCards: filtered };
}

/** Admin only, audited. Update remarks on the snapshot. */
export async function updateReportCardRemarks(
  db: DbClient,
  ctx: SessionContext,
  reportCardId: string,
  remarks: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("report_cards")
    .update({ remarks })
    .eq("id", reportCardId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Report card not found");
  await logAudit(db, ctx, "report_card.remarks_updated", "report_cards", reportCardId, {});
  return { id: (data as { id: string }).id };
}
