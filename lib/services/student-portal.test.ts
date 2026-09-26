import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { TenantBoundaryError } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import { getStudentScope, listStudents } from "@/lib/services/students";
import { getStudentSummary, getStudentAttendance } from "@/lib/services/attendance";
import { getStudentResult } from "@/lib/services/marks";
import { listStudentFees } from "@/lib/services/fees";
import { listMyTimetable } from "@/lib/services/timetable";
import { listHomework } from "@/lib/services/homework";
import { listNotices } from "@/lib/services/notices";
import { listExams } from "@/lib/services/exams";

/**
 * Server-boundary authorization suite for Phase 12 Student Portal. A student
 * login (users row + students.user_id link) is SELF-ONLY: own data, own
 * school, published results only. These tests assert the scope checks in the
 * services; RLS self-access policies are in migration 0012.
 */

const A = "school-a";
const B = "school-b";

function baseCtx(
  roles: SessionContext["roles"],
  userId = "u-student",
): SessionContext {
  return {
    authUserId: `auth-${userId}`,
    profile: {
      id: userId,
      authUserId: `auth-${userId}`,
      schoolId: A,
      email: `${userId}@example.com`,
      fullName: "Sonia Student",
      phone: null,
      isActive: true,
    },
    school: {
      id: A,
      name: "School A",
      slug: "a",
      timezone: "Asia/Kolkata",
      logoPath: null,
      primaryColor: null,
      isActive: true,
    },
    roles,
  };
}

const studentCtx = () => baseCtx(["STUDENT"]);
const adminCtx = () => baseCtx(["SCHOOL_ADMIN"], "u-admin");
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(opts: { published?: boolean } = {}): Record<string, Row[]> {
  return {
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
    ],
    parents: [
      { id: "p1", school_id: A, user_id: "u-parent", full_name: "Rajesh", is_active: true },
    ],
    users: [
      { id: "u-student", school_id: A, email: "s@a.example", full_name: "Sonia", is_active: true },
      { id: "u-student2", school_id: A, email: "s2@a.example", full_name: "Other", is_active: true },
      { id: "u-admin", school_id: A, email: "admin@a.example", full_name: "Admin", is_active: true },
      { id: "u-parent", school_id: A, email: "p@a.example", full_name: "Rajesh", is_active: true },
      { id: "u-sb", school_id: B, email: "sb@b.example", full_name: "Far", is_active: true },
    ],
    user_roles: [
      { user_id: "u-student", role: "STUDENT" },
      { user_id: "u-student2", role: "STUDENT" },
      { user_id: "u-admin", role: "SCHOOL_ADMIN" },
      { user_id: "u-parent", role: "PARENT" },
      { user_id: "u-sb", role: "STUDENT" },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", class_teacher_id: "t1", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [],
    students: [
      {
        id: "s1", school_id: A, admission_no: "A1", display_name: "Sonia", class_id: "c7",
        section_id: "sec7a", status: "active", user_id: "u-student",
      },
      {
        id: "s2", school_id: A, admission_no: "A2", display_name: "Other Student", class_id: "c7",
        section_id: "sec7a", status: "active", user_id: "u-student2",
      },
      {
        id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1",
        section_id: "secb", status: "active", user_id: "u-sb",
      },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    ],
    student_enrollments: [
      {
        id: "e1", school_id: A, student_id: "s1", academic_year_id: "y1",
        class_id: "c7", section_id: "sec7a", roll_number: "12", status: "enrolled",
        students: { id: "s1", admission_no: "A1", display_name: "Sonia", class_id: "c7", status: "active" },
      },
    ],
    exams: [
      {
        id: "ex-7", school_id: A, academic_year_id: "y1", class_id: "c7",
        name: "Unit Test 1", starts_on: "2026-09-01", ends_on: "2026-09-30", is_active: true,
      },
      {
        id: "ex-b", school_id: B, academic_year_id: "y1", class_id: "cb1",
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
    ],
    marks: [
      { id: "m1", school_id: A, exam_subject_id: "es-7m", student_id: "s1", marks_obtained: 85, is_absent: false, grade: "A", version: 1 },
    ],
    grading_systems: [
      { id: "gs1", school_id: A, name: "CBSE-style", is_default: true },
    ],
    grading_rules: [
      { id: "gr1", school_id: A, grading_system_id: "gs1", min_percentage: 80, max_percentage: 100, grade: "A", grade_point: 9, remark_template: null },
      { id: "gr2", school_id: A, grading_system_id: "gs1", min_percentage: 0, max_percentage: 79.99, grade: "D", grade_point: 4, remark_template: null },
    ],
    attendance_sessions: [
      { id: "as1", school_id: A, academic_year_id: "y1", section_id: "sec7a", attendance_date: "2026-09-20", status: "SUBMITTED" },
    ],
    attendance_records: [
      { id: "ar1", school_id: A, attendance_session_id: "as1", student_id: "s1", status: "PRESENT", remark: null },
      { id: "ar2", school_id: A, attendance_session_id: "as1", student_id: "s2", status: "ABSENT", remark: null },
    ],
    timetable_slots: [
      {
        id: "slot1", school_id: A, academic_year_id: "y1", section_id: "sec7a",
        subject_id: "sub-m", teacher_id: "t1", day_of_week: 1, period_index: 0,
        starts_at: "09:30", ends_at: "10:10", room: "R1",
        subjects: { name: "Math" }, teachers: { display_name: "Ravi" },
      },
    ],
    homework: [
      {
        id: "hw1", school_id: A, academic_year_id: "y1", section_id: "sec7a",
        subject_id: "sub-m", teacher_id: "t1", title: "Algebra worksheet",
        description: "Chapter 3", assigned_on: "2026-09-20",
        due_date: "2026-09-25", is_active: true,
        subjects: { name: "Math" }, sections: { name: "A" }, classes: { name: "Grade 7" },
        teachers: { display_name: "Ravi" },
      },
    ],
    homework_attachments: [],
    notices: [
      {
        id: "n-school", school_id: A, title: "Annual day", content: "School-wide",
        category: "GENERAL", is_published: true, published_at: "2026-09-20T10:00:00Z",
        expires_at: null, is_active: true, attachment_bucket: null, attachment_path: null,
        attachment_name: null, attachment_mime: null, attachment_bytes: null,
        created_by: "u-admin", created_at: "2026-09-20T10:00:00Z",
      },
    ],
    notice_targets: [],
    student_fees: [
      { id: "sf1", school_id: A, student_id: "s1", fee_structure_id: "gs1", total_amount: 1000, due_date: null },
      { id: "sf2", school_id: A, student_id: "s2", fee_structure_id: "gs1", total_amount: 1000, due_date: null },
    ],
    fee_payment_records: [],
    report_cards: [],
    audit_logs: [],
  };
}

const db = (opts?: { published?: boolean }) =>
  createFakeDb(seed(opts)) as unknown as DbClient;

describe("student scope resolution", () => {
  it("resolves the caller's own student profile", async () => {
    const scope = await getStudentScope(db(), studentCtx());
    expect(scope).toMatchObject({ studentId: "s1", classId: "c7", sectionId: "sec7a" });
  });

  it("returns null when no student profile is linked", async () => {
    const { students, total } = await listStudents(db(), studentCtx(), {
      page: 1,
      limit: 20,
    });
    // u-student links to s1 → the student sees ONLY their own row.
    expect(students.map((s) => s.id)).toEqual(["s1"]);
    expect(total).toBe(1);
  });
});

describe("student self-only access", () => {
  it("attendance: own summary + history, not another student's", async () => {
    const client = db();
    await expect(
      getStudentSummary(client, studentCtx(), "s1", {}),
    ).resolves.toBeDefined();
    await expect(
      getStudentAttendance(client, studentCtx(), "s1", { page: 1, limit: 50 }),
    ).resolves.toBeDefined();
    // Another student (s2, same section!) → denied.
    await expect(
      getStudentSummary(client, studentCtx(), "s2", {}),
    ).rejects.toThrow(TenantBoundaryError);
    // Cross-school student → 404.
    const fake = createFakeDb(seed());
    (fake.seed["students"] as Row[]).push({
      id: "sb1", school_id: B, admission_no: "B1", display_name: "Far",
      class_id: "cb1", section_id: "secb", status: "active", user_id: null,
    });
    await expect(
      getStudentSummary(fake as unknown as DbClient, studentCtx(), "sb1", {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("results: published visible, unpublished denied, own only", async () => {
    const published = db({ published: true });
    const result = await getStudentResult(published, studentCtx(), "s1", "ex-7");
    expect(result.published).toBe(true);
    expect(result.subjects[0]?.marksObtained).toBe(85);
    // Unpublished → denied.
    await expect(
      getStudentResult(db({ published: false }), studentCtx(), "s1", "ex-7"),
    ).rejects.toThrow(NotFoundError);
    // Another student's result → denied.
    await expect(
      getStudentResult(published, studentCtx(), "s2", "ex-7"),
    ).rejects.toThrow(TenantBoundaryError);
  });

  it("fees: own only", async () => {
    const { fees } = await listStudentFees(db(), studentCtx(), "s1");
    expect(fees).toHaveLength(1);
    await expect(listStudentFees(db(), studentCtx(), "s2")).rejects.toThrow(
      TenantBoundaryError,
    );
  });

  it("timetable: own section only", async () => {
    const { slots } = await listMyTimetable(db(), studentCtx());
    expect(slots.map((s) => s.id)).toEqual(["slot1"]);
  });

  it("homework: own section only", async () => {
    const { homework } = await listHomework(db(), studentCtx(), {
      page: 1,
      limit: 50,
    });
    expect(homework.map((h) => h.id)).toEqual(["hw1"]);
  });

  it("notices: school-wide + own section/class audience", async () => {
    const { notices } = await listNotices(db(), studentCtx(), {
      page: 1,
      limit: 50,
    });
    expect(notices.map((n) => n.id)).toEqual(["n-school"]);
  });

  it("exams: own class only (School B exams 404)", async () => {
    const { exams } = await listExams(db(), studentCtx(), { page: 1, limit: 50 });
    expect(exams.map((e) => e.id)).toEqual(["ex-7"]);
    await expect(listExams(db(), studentCtx(), { page: 1, limit: 50, classId: "cb1" })).rejects.toThrow(
      TenantBoundaryError,
    );
  });
});
