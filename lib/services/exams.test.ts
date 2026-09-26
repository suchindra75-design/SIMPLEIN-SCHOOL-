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
  createExam,
  getExam,
  listChildExamSchedule,
  listExams,
  removeExamSubject,
  setExamActive,
  updateExam,
  updateExamSubject,
  upsertExamSchedule,
  validateExamSubjectConfig,
} from "@/lib/services/exams";

/**
 * Server-boundary authorization suite for Phase 5 exams. A programmable fake
 * stands in for PostgREST so tests assert tenant injection, class scoping,
 * configuration validation, and write denial. Database-level RLS and tenant
 * triggers are reviewed in migration 0005 and exercised live via
 * supabase/tests/phase5_rls.sql (no local Postgres here to run them).
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
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(): Record<string, Row[]> {
  return {
    // t1 assigned sec7a (class c7) only.
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
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", is_active: true },
      { id: "sec8x", school_id: A, class_id: "c8", name: "X", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math", code: "MATH" },
      { id: "sub-e", school_id: A, name: "English", code: "ENG" },
      { id: "subb", school_id: B, name: "Art", code: "ART" },
    ],
    teacher_subjects: [
      { id: "as1", school_id: A, teacher_id: "t1", subject_id: "sub-m", section_id: "sec7a" },
    ],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Rahul", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Ananya", class_id: "c8", section_id: "sec8x", status: "active" },
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "yb", school_id: B, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    ],
    exams: [
      {
        id: "ex-7", school_id: A, academic_year_id: "y1", class_id: "c7",
        name: "Unit Test 1", starts_on: "2026-09-01", ends_on: "2026-09-30", is_active: true,
      },
      {
        id: "ex-8", school_id: A, academic_year_id: "y1", class_id: "c8",
        name: "Half-Yearly Examination", starts_on: "2026-11-01", ends_on: "2026-11-30", is_active: true,
      },
      {
        id: "ex-b", school_id: B, academic_year_id: "yb", class_id: "cb1",
        name: "Final Examination", starts_on: "2027-02-01", ends_on: "2027-02-28", is_active: true,
      },
    ],
    exam_subjects: [
      { id: "es-7m", school_id: A, exam_id: "ex-7", subject_id: "sub-m", max_marks: 100, passing_marks: 33, exam_date: "2026-09-10", start_time: "09:30", end_time: "11:30", subjects: { name: "Math", code: "MATH" } },
      { id: "es-8m", school_id: A, exam_id: "ex-8", subject_id: "sub-m", max_marks: 100, passing_marks: 33, exam_date: "2026-11-05", start_time: "09:30", end_time: "11:30", subjects: { name: "Math", code: "MATH" } },
      { id: "es-b", school_id: B, exam_id: "ex-b", subject_id: "subb", max_marks: 50, passing_marks: 17, exam_date: "2027-02-05", start_time: "09:30", end_time: "11:30", subjects: { name: "Art", code: "ART" } },
    ],
    exam_schedules: [
      { id: "sch-7m", school_id: A, exam_subject_id: "es-7m", room: "R1", invigilator_id: "t1" },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin lists only own-school exams", async () => {
    const { exams } = await listExams(db(), adminCtx(), { page: 1, limit: 50 });
    expect(exams.map((e) => e.id).sort()).toEqual(["ex-7", "ex-8"]);
  });

  it("admin cannot read a School B exam (404)", async () => {
    await expect(getExam(db(), adminCtx(), "ex-b")).rejects.toThrow(NotFoundError);
  });

  it("admin cannot create an exam with another school's class/year", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createExam(fake as unknown as DbClient, adminCtx(), {
        name: "Hijack",
        academicYearId: "yb",
        classId: "c7",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
        subjects: [],
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("exams", "insert")).toHaveLength(0);
  });

  it("admin cannot update a School B exam (404)", async () => {
    await expect(
      updateExam(db(), adminCtx(), "ex-b", { name: "X" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("teacher scope (class-based exam relevance)", () => {
  it("teacher lists exams for assigned classes only", async () => {
    const { exams } = await listExams(db(), teacherCtx(), { page: 1, limit: 50 });
    expect(exams.map((e) => e.id)).toEqual(["ex-7"]);
  });

  it("teacher reads an assigned-class exam with schedule", async () => {
    const exam = await getExam(db(), teacherCtx(), "ex-7");
    expect(exam.name).toBe("Unit Test 1");
    expect(exam.subjects?.[0]?.subjects?.name).toBe("Math");
    expect(exam.subjects?.[0]?.startTime).toBe("09:30");
  });

  it("teacher cannot read an unrelated-class exam — 404", async () => {
    await expect(getExam(db(), teacherCtx(), "ex-8")).rejects.toThrow(
      TenantBoundaryError,
    );
  });

  it("teacher cannot reach School B exams — 404", async () => {
    await expect(getExam(db(), teacherCtx(), "ex-b")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("teacher without assignments sees no exams", async () => {
    const { exams, total } = await listExams(
      db(),
      baseCtx(["TEACHER"], "u-nobody"),
      { page: 1, limit: 50 },
    );
    expect(exams).toEqual([]);
    expect(total).toBe(0);
  });
});

describe("parent scope (child-based exam relevance)", () => {
  it("parent lists linked child's class exams", async () => {
    const { exams } = await listExams(db(), parentCtx(), { page: 1, limit: 50 });
    expect(exams.map((e) => e.id)).toEqual(["ex-7"]);
  });

  it("parent reads the linked child's schedule", async () => {
    const { exams } = await listChildExamSchedule(db(), parentCtx(), "s1");
    expect(exams.map((e) => e.id)).toEqual(["ex-7"]);
    const subject = exams[0]?.subjects?.[0];
    expect(subject?.maxMarks).toBe(100);
    expect(subject?.passingMarks).toBe(33);
    expect(subject?.examDate).toBe("2026-09-10");
  });

  it("parent cannot access an unlinked child's schedule — 404", async () => {
    await expect(
      listChildExamSchedule(db(), parentCtx(), "s2"),
    ).rejects.toThrow(TenantBoundaryError);
    // A School B student is simply unlinked from this parent's view — the
    // scope check fires first (both map to 404 at the API).
    await expect(
      listChildExamSchedule(db(), parentCtx(), "sb1"),
    ).rejects.toThrow(TenantBoundaryError);
  });

  it("parent cannot access another class's exam — 404 (no child in that class)", async () => {
    await expect(getExam(db(), parentCtx(), "ex-8")).rejects.toThrow(
      TenantBoundaryError,
    );
  });
});

describe("configuration validation", () => {
  it("rejects invalid marks configuration", () => {
    expect(validateExamSubjectConfig({ maxMarks: 0, passingMarks: 0 })).toMatch(/Max/);
    expect(validateExamSubjectConfig({ maxMarks: 100, passingMarks: 101 })).toMatch(
      /less than or equal/,
    );
    expect(validateExamSubjectConfig({ maxMarks: 100, passingMarks: -1 })).toMatch(
      /negative/,
    );
    expect(validateExamSubjectConfig({ maxMarks: 100, passingMarks: 33 })).toBeNull();
  });

  it("rejects invalid times (end ≤ start)", () => {
    expect(
      validateExamSubjectConfig({
        maxMarks: 100,
        passingMarks: 33,
        startTime: "11:30",
        endTime: "09:30",
      }),
    ).toMatch(/End time/);
    expect(
      validateExamSubjectConfig({
        maxMarks: 100,
        passingMarks: 33,
        startTime: "09:30",
        endTime: "09:30",
      }),
    ).toMatch(/End time/);
  });

  it("rejects subject exam dates outside the exam window", async () => {
    await expect(
      createExam(db(), adminCtx(), {
        name: "Window Test",
        academicYearId: "y1",
        classId: "c7",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
        subjects: [
          {
            subjectId: "sub-m",
            maxMarks: 100,
            passingMarks: 33,
            examDate: "2026-10-05",
          },
        ],
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects duplicate subject in one exam definition and duplicate exam names", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createExam(fake as unknown as DbClient, adminCtx(), {
        name: "Dup Subject",
        academicYearId: "y1",
        classId: "c7",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
        subjects: [
          { subjectId: "sub-m", maxMarks: 100, passingMarks: 33 },
          { subjectId: "sub-m", maxMarks: 50, passingMarks: 17 },
        ],
      }),
    ).rejects.toThrow(ConflictError);
    // Duplicate exam name for the same class+year: failNext targets the exams
    // INSERT specifically (the service's earlier year/class checks must pass).
    fake.failOn = {
      table: "exams",
      op: "insert",
      code: "23505",
      message: 'duplicate key "exams_school_year_class_name"',
    };
    await expect(
      createExam(fake as unknown as DbClient, adminCtx(), {
        name: "Unit Test 1",
        academicYearId: "y1",
        classId: "c7",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        subjects: [],
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("unauthorized modifications", () => {
  it("teacher cannot create/update/delete exams", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createExam(client, teacherCtx(), {
        name: "Nope",
        academicYearId: "y1",
        classId: "c7",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
        subjects: [],
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateExam(client, teacherCtx(), "ex-7", { name: "Nope" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      removeExamSubject(client, teacherCtx(), "es-7m"),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      setExamActive(client, teacherCtx(), "ex-7", false),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("exams", "insert")).toHaveLength(0);
    expect(fake.callsTo("exam_subjects", "delete")).toHaveLength(0);
  });

  it("parent cannot create/update/delete exams", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      setExamActive(client, parentCtx(), "ex-7", false),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateExamSubject(client, parentCtx(), "es-7m", { maxMarks: 10 }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("exams", "update")).toHaveLength(0);
    expect(fake.callsTo("exam_subjects", "update")).toHaveLength(0);
  });

  it("cross-school schedule invigilator is denied", async () => {
    const fake = createFakeDb(seed());
    await expect(
      upsertExamSchedule(fake as unknown as DbClient, adminCtx(), "es-7m", {
        invigilatorId: "tb",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("exam_schedules", "upsert")).toHaveLength(0);
  });

  it("exam subject from another school cannot be modified (404)", async () => {
    await expect(
      updateExamSubject(db(), adminCtx(), "es-b", { maxMarks: 10 }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      upsertExamSchedule(db(), adminCtx(), "es-b", { room: "R9" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("audit logging", () => {
  it("audits exam creation, updates, and activation", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await createExam(client, adminCtx(), {
      name: "Final Examination",
      academicYearId: "y1",
      classId: "c8",
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
      subjects: [],
    });
    await updateExam(client, adminCtx(), "ex-7", { name: "Unit Test 1 (Rev)" });
    await setExamActive(client, adminCtx(), "ex-8", false);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.map((a) => (a.payload as Row)["action"])).toEqual([
      "exam.created",
      "exam.updated",
      "exam.deactivated",
    ]);
    expect(audits[0]?.payload).toMatchObject({ school_id: A });
  });

  it("audits subject config and schedule changes", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await updateExamSubject(client, adminCtx(), "es-7m", { maxMarks: 80 });
    await upsertExamSchedule(client, adminCtx(), "es-7m", { room: "R2" });
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.map((a) => (a.payload as Row)["action"])).toEqual([
      "exam.subject_updated",
      "exam.schedule_updated",
    ]);
  });
});
