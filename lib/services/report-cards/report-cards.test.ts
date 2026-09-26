import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError, TenantBoundaryError } from "@/lib/auth/session";
import {
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import {
  buildReportCard,
  generateReportCard,
  getReportCardPdfUrl,
  listReportCards,
  updateReportCardRemarks,
} from "@/lib/services/report-cards";

/**
 * Server-boundary authorization suite for Phase 7 report cards. A
 * programmable fake stands in for PostgREST/Storage so tests assert tenant
 * injection, teacher/parent scope, published-only access, reuse of the
 * existing result/attendance calculations, and real PDF generation.
 * Database-level RLS and triggers are reviewed in migration 0007 and
 * exercised live via supabase/tests/phase7_rls.sql (no local Postgres here).
 */

const A = "school-a";
const B = "school-b";

function baseCtx(
  roles: SessionContext["roles"],
  userId = "u-admin",
): SessionContext {
  return {
    authUserId: `auth-${userId}`,
    profile: {
      id: userId,
      authUserId: `auth-${userId}`,
      schoolId: A,
      email: `${userId}@example.com`,
      fullName: userId,
      phone: null,
      isActive: true,
    },
    school: {
      id: A,
      name: "School A",
      slug: "a",
      timezone: "Asia/Kolkata",
      logoPath: null,
      primaryColor: "#1f3b73",
      isActive: true,
    },
    roles,
  };
}

const adminCtx = () => baseCtx(["SCHOOL_ADMIN"]);
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(opts: { published?: boolean } = {}): Record<string, Row[]> {
  return {
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
      { id: "tb", school_id: B, user_id: "u-tb", employee_no: "E9", display_name: "Other", is_active: true },
    ],
    parents: [
      { id: "p1", school_id: A, user_id: "u-parent", full_name: "Rajesh", is_active: true },
      { id: "pb", school_id: B, user_id: "u-pb", full_name: "Far", is_active: true },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "c8", school_id: A, name: "Grade 8" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", class_teacher_id: "t1", is_active: true },
      { id: "sec7b", school_id: A, class_id: "c7", name: "B", is_active: true },
      { id: "sec8x", school_id: A, class_id: "c8", name: "X", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math", code: "MATH" },
      { id: "sub-e", school_id: A, name: "English", code: "ENG" },
      { id: "subb", school_id: B, name: "Art", code: "ART" },
    ],
    teacher_subjects: [
      { id: "ts1", school_id: A, teacher_id: "t1", subject_id: "sub-m", section_id: "sec7a" },
    ],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Rahul", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Ananya", class_id: "c7", section_id: "sec7b", status: "active" },
      { id: "s3", school_id: A, admission_no: "A3", display_name: "Farah", class_id: "c8", section_id: "sec8x", status: "active" },
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "yb", school_id: B, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    ],
    student_enrollments: [
      {
        id: "e1", school_id: A, student_id: "s1", academic_year_id: "y1",
        class_id: "c7", section_id: "sec7a", roll_number: "12", status: "enrolled",
        students: { id: "s1", admission_no: "A1", display_name: "Rahul", class_id: "c7", status: "active" },
      },
    ],
    exams: [
      {
        id: "ex-7", school_id: A, academic_year_id: "y1", class_id: "c7",
        name: "Unit Test 1", starts_on: "2026-09-01", ends_on: "2026-09-30", is_active: true,
      },
      {
        id: "ex-b", school_id: B, academic_year_id: "yb", class_id: "cb1",
        name: "Final", starts_on: "2027-02-01", ends_on: "2027-02-28", is_active: true,
      },
    ],
    exam_subjects: [
      {
        id: "es-7m", school_id: A, exam_id: "ex-7", subject_id: "sub-m",
        max_marks: 100, passing_marks: 33, exam_date: "2026-09-10",
        start_time: "09:30", end_time: "11:30",
        is_locked: true, is_published: opts.published ?? false,
        subjects: { name: "Math", code: "MATH" },
      },
      {
        id: "es-7e", school_id: A, exam_id: "ex-7", subject_id: "sub-e",
        max_marks: 50, passing_marks: 17, exam_date: "2026-09-12",
        start_time: "09:30", end_time: "11:30",
        is_locked: true, is_published: opts.published ?? false,
        subjects: { name: "English", code: "ENG" },
      },
      {
        id: "es-b", school_id: B, exam_id: "ex-b", subject_id: "subb",
        max_marks: 50, passing_marks: 17, exam_date: "2027-02-05",
        start_time: "09:30", end_time: "11:30",
        is_locked: false, is_published: true,
        subjects: { name: "Art", code: "ART" },
      },
    ],
    marks: [
      { id: "m1", school_id: A, exam_subject_id: "es-7m", student_id: "s1", marks_obtained: 85, is_absent: false, grade: "A", version: 1 },
      { id: "m2", school_id: A, exam_subject_id: "es-7e", student_id: "s1", marks_obtained: null, is_absent: true, grade: null, version: 1 },
      { id: "mb1", school_id: B, exam_subject_id: "es-b", student_id: "sb1", marks_obtained: 40, is_absent: false, grade: "B", version: 1 },
    ],
    grading_systems: [
      { id: "gs1", school_id: A, name: "CBSE-style", is_default: true },
      { id: "gsb", school_id: B, name: "B-style", is_default: true },
    ],
    grading_rules: [
      { id: "gr1", school_id: A, grading_system_id: "gs1", min_percentage: 80, max_percentage: 100, grade: "A", grade_point: 9, remark_template: null },
      { id: "gr2", school_id: A, grading_system_id: "gs1", min_percentage: 0, max_percentage: 79.99, grade: "D", grade_point: 4, remark_template: null },
    ],
    attendance_sessions: [
      { id: "as1", school_id: A, academic_year_id: "y1", section_id: "sec7a", attendance_date: "2026-09-20", status: "SUBMITTED" },
      { id: "as2", school_id: A, academic_year_id: "y1", section_id: "sec7a", attendance_date: "2026-09-21", status: "SUBMITTED" },
    ],
    attendance_records: [
      { id: "ar1", school_id: A, attendance_session_id: "as1", student_id: "s1", status: "PRESENT", remark: null },
      { id: "ar2", school_id: A, attendance_session_id: "as2", student_id: "s1", status: "LEAVE", remark: null },
    ],
    report_cards: [
      {
        id: "rc1", school_id: A, exam_id: "ex-7", student_id: "s1",
        total_obtained: 85, max_total: 150, percentage: 56.67, cgpa: null,
        overall_grade: "D", attendance_percentage: 100, remarks: null,
        pdf_path: "schools/school-a/report-cards/ex-7/s1.pdf",
        status: opts.published === true ? "PUBLISHED" : "DRAFT",
        students: { id: "s1", display_name: "Rahul", admission_no: "A1", section_id: "sec7a" },
      },
      {
        id: "rc2", school_id: A, exam_id: "ex-7", student_id: "s2",
        total_obtained: 70, max_total: 150, percentage: 46.67, cgpa: null,
        overall_grade: "D", attendance_percentage: 90, remarks: null,
        pdf_path: "schools/school-a/report-cards/ex-7/s2.pdf",
        status: opts.published === true ? "PUBLISHED" : "DRAFT",
        students: { id: "s2", display_name: "Ananya", admission_no: "A2", section_id: "sec7b" },
      },
    ],
    audit_logs: [],
  };
}

const db = (opts?: { published?: boolean }) =>
  createFakeDb(seed(opts)) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin builds a report card for own school", async () => {
    const payload = await buildReportCard(db(), adminCtx(), "s1", "ex-7");
    expect(payload.school.name).toBe("School A");
    expect(payload.student.admissionNo).toBe("A1");
  });

  it("admin cannot build a School B report card (404)", async () => {
    await expect(buildReportCard(db(), adminCtx(), "sb1", "ex-b")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("cross-school student in the payload is denied", async () => {
    // s1 is in school A; asking with a school-B exam id → 404.
    await expect(buildReportCard(db(), adminCtx(), "s1", "ex-b")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("teacher scope", () => {
  it("teacher reads report cards for authorized classes", async () => {
    const payload = await buildReportCard(db(), teacherCtx(), "s1", "ex-7");
    expect(payload.student.name).toBe("Rahul");
    const { reportCards } = await listReportCards(db(), teacherCtx(), "ex-7");
    expect(reportCards).toHaveLength(1);
  });

  it("teacher cannot read an unrelated class's report card — 404", async () => {
    await expect(buildReportCard(db(), teacherCtx(), "s3", "ex-b")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("teacher cannot generate report cards (admin-only)", async () => {
    const fake = createFakeDb(seed());
    await expect(
      generateReportCard(fake as unknown as DbClient, teacherCtx(), "s1", "ex-7"),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("report_cards", "upsert")).toHaveLength(0);
  });
});

describe("parent-child scope (published-only)", () => {
  it("parent reads a linked child's PUBLISHED report card", async () => {
    const payload = await buildReportCard(db({ published: true }), parentCtx(), "s1", "ex-7");
    expect(payload.published).toBe(true);
    expect(payload.student.name).toBe("Rahul");
    expect(payload.reportCard.status).toBe("PUBLISHED");
    // Signed PDF URL resolves for a published card.
    const url = await getReportCardPdfUrl(
      db({ published: true }),
      parentCtx(),
      "rc1",
    );
    expect(url.startsWith("https://signed.test/report-cards/")).toBe(true);
  });

  it("parent is blocked from UNPUBLISHED results", async () => {
    await expect(
      buildReportCard(db({ published: false }), parentCtx(), "s1", "ex-7"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      getReportCardPdfUrl(db({ published: false }), parentCtx(), "rc1"),
    ).rejects.toThrow(NotFoundError);
  });

  it("parent cannot read another student's report card — 404", async () => {
    await expect(
      buildReportCard(db({ published: true }), parentCtx(), "s2", "ex-7"),
    ).rejects.toThrow(TenantBoundaryError);
    // rc2 belongs to s2 (unlinked) → denied; rc1 (s1, linked) → allowed.
    await expect(
      getReportCardPdfUrl(db({ published: true }), parentCtx(), "rc2"),
    ).rejects.toThrow(TenantBoundaryError);
  });

  it("parent cannot generate report cards", async () => {
    const fake = createFakeDb(seed());
    await expect(
      generateReportCard(fake as unknown as DbClient, parentCtx(), "s1", "ex-7"),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("report_cards", "upsert")).toHaveLength(0);
  });
});

describe("marks/grades/percentage + attendance included", () => {
  it("reuses the existing calculations (Math 85 + English absent)", async () => {
    const payload = await buildReportCard(db({ published: true }), adminCtx(), "s1", "ex-7");
    // Marks come from the Phase 6 result calc; grade from grading rules.
    const math = payload.subjects.find((s) => s.subjectName === "Math");
    expect(math?.marksObtained).toBe(85);
    expect(math?.grade).toBe("A");
    // English absent → 0 obtained but full max (counts against).
    const eng = payload.subjects.find((s) => subjectIsEnglish(s.subjectName));
    expect(eng?.isAbsent).toBe(true);
    // Total 85/150 → 56.67% → D (existing calc, no duplication here).
    expect(payload.reportCard.totalObtained).toBe(85);
    expect(payload.reportCard.maxTotal).toBe(150);
    expect(payload.reportCard.percentage).toBe(56.67);
    expect(payload.reportCard.overallGrade).toBe("D");
    // Attendance summary included (2 sessions: 1 PRESENT, 1 LEAVE excused).
    expect(payload.attendance.percentage).toBe(100);
    expect(payload.reportCard.attendancePercentage).toBe(100);
  });

  it("missing marks → zero totals and null percentage (handled safely)", async () => {
    const fake = createFakeDb(seed({ published: true }));
    fake.seed["marks"] = [];
    const payload = await buildReportCard(fake as unknown as DbClient, adminCtx(), "s1", "ex-7");
    expect(payload.reportCard.totalObtained).toBe(0);
    expect(payload.reportCard.percentage).toBeNull();
    expect(payload.reportCard.overallGrade).toBeNull();
  });
});

function subjectIsEnglish(name: string): boolean {
  return name === "English";
}

describe("PDF generation", () => {
  it("generates a real PDF snapshot + stores it privately (admin only)", async () => {
    const fake = createFakeDb(seed({ published: true }));
    const result = await generateReportCard(
      fake as unknown as DbClient,
      adminCtx(),
      "s1",
      "ex-7",
    );
    expect(result.status).toBe("PUBLISHED");
    // PDF uploaded to the private report-cards bucket under the tenant prefix.
    const uploads = fake.callsTo("storage:report-cards", "insert");
    expect(uploads).toHaveLength(1);
    const path = (uploads[0]?.payload as { path: string }).path;
    expect(path.startsWith(`schools/${A}/report-cards/ex-7/`)).toBe(true);
    expect(path.endsWith(".pdf")).toBe(true);
    // Snapshot row upserted with UNIQUE(exam, student).
    expect(fake.callsTo("report_cards", "upsert")).toHaveLength(1);
    // Audited.
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits[0]?.payload).toMatchObject({
      school_id: A,
      action: "report_card.generated",
    });
  });

  it("generation marks DRAFT when the result is unpublished", async () => {
    const fake = createFakeDb(seed({ published: false }));
    const result = await generateReportCard(
      fake as unknown as DbClient,
      adminCtx(),
      "s1",
      "ex-7",
    );
    expect(result.status).toBe("DRAFT");
  });

  it("remarks update is audited", async () => {
    const fake = createFakeDb(seed({ published: true }));
    await updateReportCardRemarks(fake as unknown as DbClient, adminCtx(), "rc1", "Good progress");
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits[0]?.payload).toMatchObject({ action: "report_card.remarks_updated" });
  });
});
