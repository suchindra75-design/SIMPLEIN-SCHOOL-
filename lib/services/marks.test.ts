import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError, TenantBoundaryError } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import {
  calculateResult,
  getMarksGrid,
  getStudentResult,
  listMarkableSubjects,
  saveMarks,
  setMarksLocked,
  setResultsPublished,
} from "@/lib/services/marks";

/**
 * Server-boundary authorization suite for Phase 6 marks/grades. A
 * programmable fake stands in for PostgREST so tests assert tenant
 * injection, exam/subject scope, published-only parent access, lock
 * enforcement, and marks validity. Database-level RLS and triggers are
 * reviewed in migration 0006 and exercised live via
 * supabase/tests/phase6_rls.sql (no local Postgres here to run them).
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
      logoPath: null, primaryColor: null,
      isActive: true,
    },
    roles,
  };
}

const adminCtx = () => baseCtx(["SCHOOL_ADMIN"]);
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");
const teacher2Ctx = () => baseCtx(["TEACHER"], "u-teacher2");
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(opts: { locked?: boolean; published?: boolean } = {}): Record<string, Row[]> {
  // t1: class teacher of sec7a (class c7) → all class-7 subjects.
  // t2: Math assignee in sec7a only (NOT class teacher) → Math only.
  return {
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
      { id: "t2", school_id: A, user_id: "u-teacher2", employee_no: "E2", display_name: "Priya", is_active: true },
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
      { id: "ts2", school_id: A, teacher_id: "t2", subject_id: "sub-m", section_id: "sec7a" },
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
      {
        id: "e2", school_id: A, student_id: "s2", academic_year_id: "y1",
        class_id: "c7", section_id: "sec7b", roll_number: "5", status: "enrolled",
        students: { id: "s2", admission_no: "A2", display_name: "Ananya", class_id: "c7", status: "active" },
      },
    ],
    exams: [
      {
        id: "ex-7", school_id: A, academic_year_id: "y1", class_id: "c7",
        name: "Unit Test 1", starts_on: "2026-09-01", ends_on: "2026-09-30", is_active: true,
      },
      {
        id: "ex-8", school_id: A, academic_year_id: "y1", class_id: "c8",
        name: "Half-Yearly", starts_on: "2026-11-01", ends_on: "2026-11-30", is_active: true,
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
        is_locked: opts.locked ?? false, is_published: opts.published ?? false,
        subjects: { name: "Math", code: "MATH" },
      },
      {
        id: "es-7e", school_id: A, exam_id: "ex-7", subject_id: "sub-e",
        max_marks: 50, passing_marks: 17, exam_date: "2026-09-12",
        start_time: "09:30", end_time: "11:30",
        is_locked: false, is_published: opts.published ?? false,
        subjects: { name: "English", code: "ENG" },
      },
      {
        id: "es-8m", school_id: A, exam_id: "ex-8", subject_id: "sub-m",
        max_marks: 100, passing_marks: 33, exam_date: "2026-11-05",
        start_time: "09:30", end_time: "11:30",
        is_locked: false, is_published: false,
        subjects: { name: "Math", code: "MATH" },
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
      { id: "mb1", school_id: B, exam_subject_id: "es-b", student_id: "sb1", marks_obtained: 40, is_absent: false, grade: "B", version: 1 },
    ],
    grading_systems: [
      { id: "gs1", school_id: A, name: "CBSE-style", is_default: true },
    ],
    grading_rules: [
      { id: "gr1", school_id: A, grading_system_id: "gs1", min_percentage: 90, max_percentage: 100, grade: "A+", grade_point: 10, remark_template: null },
      { id: "gr2", school_id: A, grading_system_id: "gs1", min_percentage: 80, max_percentage: 89.99, grade: "A", grade_point: 9, remark_template: null },
      { id: "gr3", school_id: A, grading_system_id: "gs1", min_percentage: 0, max_percentage: 79.99, grade: "D", grade_point: 4, remark_template: null },
    ],
    audit_logs: [],
  };
}

const db = (opts?: { locked?: boolean; published?: boolean }) =>
  createFakeDb(seed(opts)) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin cannot read a School B marks grid (404)", async () => {
    await expect(getMarksGrid(db(), adminCtx(), "es-b")).rejects.toThrow(NotFoundError);
  });

  it("admin cannot read a School B student result (404)", async () => {
    await expect(
      getStudentResult(db(), adminCtx(), "sb1", "ex-b"),
    ).rejects.toThrow(NotFoundError);
  });

  it("admin lists only own-school markable subjects", async () => {
    const { subjects } = await listMarkableSubjects(db(), adminCtx(), "ex-7");
    expect(subjects.map((s) => s.id).sort()).toEqual(["es-7e", "es-7m"]);
  });
});

describe("teacher exam/subject scope", () => {
  it("class teacher may enter all subjects for the exam's class", async () => {
    const grid = await getMarksGrid(db(), teacherCtx(), "es-7m");
    expect(grid.roster.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    const { subjects } = await listMarkableSubjects(db(), teacherCtx(), "ex-7");
    expect(subjects.map((s) => s.id).sort()).toEqual(["es-7e", "es-7m"]);
  });

  it("subject assignee (not class teacher) may enter only their subject", async () => {
    const grid = await getMarksGrid(db(), teacher2Ctx(), "es-7m");
    expect(grid.examSubject.id).toBe("es-7m");
    await expect(getMarksGrid(db(), teacher2Ctx(), "es-7e")).rejects.toThrow(
      TenantBoundaryError,
    );
    const { subjects } = await listMarkableSubjects(db(), teacher2Ctx(), "ex-7");
    expect(subjects.map((s) => s.id)).toEqual(["es-7m"]);
  });

  it("teacher cannot reach another class's exam subject — 404", async () => {
    await expect(getMarksGrid(db(), teacherCtx(), "es-8m")).rejects.toThrow(
      TenantBoundaryError,
    );
  });

  it("teacher cannot reach School B marks — 404", async () => {
    await expect(getMarksGrid(db(), teacherCtx(), "es-b")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("marks validity", () => {
  it("rejects marks above the maximum and negative marks", async () => {
    await expect(
      saveMarks(db(), teacherCtx(), "es-7m", {
        records: [{ studentId: "s1", marksObtained: 150, isAbsent: false }],
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      saveMarks(db(), teacherCtx(), "es-7m", {
        records: [{ studentId: "s1", marksObtained: -5, isAbsent: false }],
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects marks for students not enrolled in the exam's class", async () => {
    const fake = createFakeDb(seed());
    await expect(
      saveMarks(fake as unknown as DbClient, teacherCtx(), "es-7m", {
        records: [{ studentId: "s3", marksObtained: 50, isAbsent: false }],
      }),
    ).rejects.toThrow(ConflictError);
    expect(fake.callsTo("marks", "upsert")).toHaveLength(0);
  });

  it("saves marks with a batched upsert and computes grades server-side", async () => {
    const fake = createFakeDb(seed());
    const result = await saveMarks(fake as unknown as DbClient, teacherCtx(), "es-7m", {
      records: [{ studentId: "s1", marksObtained: 92, isAbsent: false }],
    });
    expect(result.saved).toBe(1);
    const upserts = fake.callsTo("marks", "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.onConflict).toBe("exam_subject_id,student_id");
    const payload = (upserts[0]?.payload as Row[])[0] as Row;
    expect(payload["grade"]).toBe("A+"); // 92 → 90–100 band (server-side)
    expect(payload["school_id"]).toBe(A);
  });

  it("duplicate student/exam-subject marks dedupe via upsert", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await saveMarks(client, teacherCtx(), "es-7m", {
      records: [{ studentId: "s1", marksObtained: 70, isAbsent: false }],
    });
    await saveMarks(client, teacherCtx(), "es-7m", {
      records: [{ studentId: "s1", marksObtained: 75, isAbsent: false }],
    });
    expect(fake.callsTo("marks", "upsert")).toHaveLength(2);
    expect(fake.seed["marks"]).toHaveLength(2); // existing s1 + sb1 rows; s1 updated, not duplicated
  });
});

describe("lock + publish states", () => {
  it("locked marks cannot be edited by a teacher (409)", async () => {
    const fake = createFakeDb(seed({ locked: true }));
    await expect(
      saveMarks(fake as unknown as DbClient, teacherCtx(), "es-7m", {
        records: [{ studentId: "s1", marksObtained: 90, isAbsent: false }],
      }),
    ).rejects.toThrow(ConflictError);
    expect(fake.callsTo("marks", "upsert")).toHaveLength(0);
  });

  it("admin can correct locked marks (authorized operation)", async () => {
    const fake = createFakeDb(seed({ locked: true }));
    const result = await saveMarks(fake as unknown as DbClient, adminCtx(), "es-7m", {
      records: [{ studentId: "s1", marksObtained: 90, isAbsent: false }],
    });
    expect(result.saved).toBe(1);
  });

  it("teacher cannot lock/unlock/publish/unpublish", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(setMarksLocked(client, teacherCtx(), "es-7m", true)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(setMarksLocked(client, teacherCtx(), "es-7m", false)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      setResultsPublished(client, teacherCtx(), "es-7m", true),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("exam_subjects", "update")).toHaveLength(0);
  });

  it("parent cannot modify marks or states", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    // authorizeRoles rejects parents before the scope check (403).
    await expect(
      saveMarks(client, parentCtx(), "es-7m", {
        records: [{ studentId: "s1", marksObtained: 90, isAbsent: false }],
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      setResultsPublished(client, parentCtx(), "es-7m", true),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("marks", "upsert")).toHaveLength(0);
  });
});

describe("parent results (published-only)", () => {
  it("parent sees a published result with marks and grades", async () => {
    const result = await getStudentResult(db({ published: true }), parentCtx(), "s1", "ex-7");
    expect(result.published).toBe(true);
    expect(result.subjects[0]?.marksObtained).toBe(85);
    expect(result.subjects[0]?.grade).toBe("A");
    // Total: Math 85/100 + English absent (max 50, counts against) → 85/150.
    expect(result.totalObtained).toBe(85);
    expect(result.maxTotal).toBe(150);
    expect(result.percentage).toBe(56.67);
    expect(result.overallGrade).toBe("D");
  });

  it("parent cannot see unpublished results (whole result withheld)", async () => {
    await expect(
      getStudentResult(db({ published: false }), parentCtx(), "s1", "ex-7"),
    ).rejects.toThrow(NotFoundError);
  });

  it("parent cannot see another student's result — 404", async () => {
    await expect(
      getStudentResult(db({ published: true }), parentCtx(), "s2", "ex-7"),
    ).rejects.toThrow(TenantBoundaryError);
    await expect(
      getStudentResult(db({ published: true }), parentCtx(), "sb1", "ex-b"),
    ).rejects.toThrow(NotFoundError);
  });

  it("admin and teachers see results regardless of publish state", async () => {
    const unpublished = db({ published: false });
    const admin = await getStudentResult(unpublished, adminCtx(), "s1", "ex-7");
    expect(admin.published).toBe(false);
    const teacher = await getStudentResult(unpublished, teacherCtx(), "s1", "ex-7");
    expect(teacher.published).toBe(false);
  });
});

describe("student results (published-only, Phase 14)", () => {
  const studentCtx = () => baseCtx(["STUDENT"], "u-student");
  const studentDb = (opts?: { locked?: boolean; published?: boolean }) => {
    const s = seed(opts);
    const me = (s.students as Row[]).find((r) => r["id"] === "s1");
    if (me !== undefined) me["user_id"] = "u-student";
    return createFakeDb(s) as unknown as DbClient;
  };

  it("student sees own published result", async () => {
    const result = await getStudentResult(studentDb({ published: true }), studentCtx(), "s1", "ex-7");
    expect(result.published).toBe(true);
    expect(result.subjects[0]?.marksObtained).toBe(85);
  });

  it("student cannot see unpublished results", async () => {
    await expect(
      getStudentResult(studentDb({ published: false }), studentCtx(), "s1", "ex-7"),
    ).rejects.toThrow(NotFoundError);
  });

  it("student cannot see another student's result — 404", async () => {
    await expect(
      getStudentResult(studentDb({ published: true }), studentCtx(), "s2", "ex-7"),
    ).rejects.toThrow(TenantBoundaryError);
    await expect(
      getStudentResult(studentDb({ published: true }), studentCtx(), "sb1", "ex-b"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("result calculation (pure)", () => {
  it("absent subjects count against (0 obtained, full max)", () => {
    const result = calculateResult(
      { id: "s1", displayName: "Rahul", admissionNo: "A1" },
      [
        { subjectId: "sub-m", subjectName: "Math", marksObtained: 85, maxMarks: 100, isAbsent: false, grade: "A" },
        { subjectId: "sub-e", subjectName: "English", marksObtained: null, maxMarks: 50, isAbsent: true, grade: null },
      ],
      [
        { minPercentage: 80, maxPercentage: 100, grade: "A", gradePoint: 9 },
        { minPercentage: 0, maxPercentage: 79.99, grade: "D", gradePoint: 4 },
      ],
    );
    expect(result.totalObtained).toBe(85);
    expect(result.maxTotal).toBe(150);
    expect(result.percentage).toBe(56.67);
    expect(result.overallGrade).toBe("D");
  });

  it("all subjects present → clean totals", () => {
    const result = calculateResult(
      { id: "s1", displayName: "Rahul", admissionNo: "A1" },
      [
        { subjectId: "sub-m", subjectName: "Math", marksObtained: 92, maxMarks: 100, isAbsent: false, grade: "A+" },
        { subjectId: "sub-e", subjectName: "English", marksObtained: 45, maxMarks: 50, isAbsent: false, grade: "A" },
      ],
      [
        { minPercentage: 90, maxPercentage: 100, grade: "A+", gradePoint: 10 },
        { minPercentage: 0, maxPercentage: 89.99, grade: "B", gradePoint: 8 },
      ],
    );
    expect(result.totalObtained).toBe(137);
    expect(result.maxTotal).toBe(150);
    expect(result.percentage).toBe(91.33);
    expect(result.overallGrade).toBe("A+");
  });
});

describe("audit logging", () => {
  it("audits mark saves, lock, and publish with old/new values", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await saveMarks(client, teacherCtx(), "es-7m", {
      records: [{ studentId: "s1", marksObtained: 90, isAbsent: false }],
    });
    await setMarksLocked(client, adminCtx(), "es-7m", true);
    await setResultsPublished(client, adminCtx(), "es-7m", true);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.map((a) => (a.payload as Row)["action"])).toEqual([
      "marks.saved",
      "marks.locked",
      "results.published",
    ]);
    const metadata = (audits[0]?.payload as Row)["metadata"] as {
      changed: { studentId: string; from: number; to: number }[];
    };
    expect(metadata.changed).toEqual([
      { studentId: "s1", from: 85, to: 90 },
    ]);
  });
});
