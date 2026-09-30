import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import {
  ForbiddenError,
  TenantBoundaryError,
} from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
  type DbClient,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import {
  getMarkingPayload,
  getSectionSummary,
  getStudentAttendance,
  getStudentSummary,
  listAttendanceSections,
  saveAttendance,
} from "@/lib/services/attendance";

/**
 * Server-boundary authorization suite for Phase 4 attendance. A programmable
 * fake stands in for PostgREST so tests assert tenant injection, link scopes,
 * duplicate-session prevention, enrollment integrity, and write denial.
 * Database-level RLS and tenant triggers are reviewed in migration 0004 and
 * exercised live via supabase/tests/phase4_rls.sql (no local Postgres here).
 */

const A = "school-a";
const B = "school-b";
const TODAY = "2026-09-25"; // matches env date; year seeded to contain it

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
    // t1: class teacher of sec7a + Math assignee in sec7a (NOT sec7b/sec8x).
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
      { id: "sec7b", school_id: A, class_id: "c7", name: "B", is_active: true },
      { id: "sec8x", school_id: A, class_id: "c8", name: "X", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [
      { id: "as1", school_id: A, teacher_id: "t1", subject_id: "sub-m", section_id: "sec7a" },
    ],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Rahul", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Ananya", class_id: "c7", section_id: "sec7b", status: "active" },
      { id: "s3", school_id: A, admission_no: "A3", display_name: "Priya", class_id: "c8", section_id: "sec8x", status: "active" },
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
        students: { id: "s1", admission_no: "A1", display_name: "Rahul", section_id: "sec7a", status: "active" },
      },
      {
        id: "e2", school_id: A, student_id: "s2", academic_year_id: "y1",
        class_id: "c7", section_id: "sec7b", roll_number: "5", status: "enrolled",
        students: { id: "s2", admission_no: "A2", display_name: "Ananya", section_id: "sec7b", status: "active" },
      },
    ],
    attendance_sessions: [
      { id: "sess-old", school_id: A, academic_year_id: "y1", section_id: "sec7a", attendance_date: "2026-09-24", status: "SUBMITTED", created_by: "u-teacher", updated_by: "u-teacher" },
      { id: "sess-b", school_id: B, academic_year_id: "yb", section_id: "secb", attendance_date: "2026-09-24", status: "SUBMITTED" },
    ],
    attendance_records: [
      { id: "r1", school_id: A, attendance_session_id: "sess-old", student_id: "s1", status: "PRESENT", remark: null, attendance_sessions: { attendance_date: "2026-09-24" } },
      { id: "r2", school_id: A, attendance_session_id: "sess-old", student_id: "s2", status: "ABSENT", remark: null, attendance_sessions: { attendance_date: "2026-09-24" } },
      { id: "rb", school_id: B, attendance_session_id: "sess-b", student_id: "sb1", status: "PRESENT", remark: null, attendance_sessions: { attendance_date: "2026-09-24" } },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin lists only own-school sections (tenant injected)", async () => {
    const fake = createFakeDb(seed());
    const { sections } = await listAttendanceSections(fake as unknown as DbClient, adminCtx());
    expect(sections.map((s) => s.id).sort()).toEqual(["sec7a", "sec7b", "sec8x"]);
    const selects = fake.callsTo("sections", "select");
    expect(
      selects.some((c) =>
        c.filters.some((f) => f.col === "school_id" && f.val === A),
      ),
    ).toBe(true);
  });

  it("admin cannot view/mark a School B section (404)", async () => {
    await expect(
      getMarkingPayload(db(), adminCtx(), "secb", "2026-09-24"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      saveAttendance(db(), adminCtx(), "secb", {
        date: "2026-09-25",
        records: [{ studentId: "sb1", status: "PRESENT" }],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("admin summary for a School B section is denied (404)", async () => {
    await expect(
      getSectionSummary(db(), adminCtx(), "secb", "2026-09-24"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("teacher section scope", () => {
  it("teacher lists only assigned sections", async () => {
    const { sections } = await listAttendanceSections(db(), teacherCtx());
    expect(sections.map((s) => s.id)).toEqual(["sec7a"]);
  });

  it("teacher loads assigned section (7A)", async () => {
    const payload = await getMarkingPayload(db(), teacherCtx(), "sec7a", "2026-09-25");
    expect(payload.section.id).toBe("sec7a");
    // Roster comes from enrollments for the applicable year.
    expect(payload.students.map((s) => s.id)).toEqual(["s1"]);
    expect(payload.students[0]?.rollNumber).toBe("12");
    expect(payload.session).toBeNull();
  });

  it("teacher cannot load an unassigned section (8B) — 404", async () => {
    await expect(
      getMarkingPayload(db(), teacherCtx(), "sec7b", "2026-09-25"),
    ).rejects.toThrow(TenantBoundaryError);
    await expect(
      getMarkingPayload(db(), teacherCtx(), "sec8x", "2026-09-25"),
    ).rejects.toThrow(TenantBoundaryError);
  });

  it("teacher cannot reach School B attendance — 404 (out-of-scope boundary)", async () => {
    // From the teacher's view, a School B section is simply not in their
    // authorized assignment → TenantBoundaryError (maps to 404 at the API).
    await expect(
      getMarkingPayload(db(), teacherCtx(), "secb", "2026-09-24"),
    ).rejects.toThrow(TenantBoundaryError);
  });

  it("teacher without a profile is denied before any query", async () => {
    const fake = createFakeDb(seed());
    await expect(
      getMarkingPayload(fake as unknown as DbClient, baseCtx(["TEACHER"], "u-nobody"), "sec7a", "2026-09-25"),
    ).rejects.toThrow(TenantBoundaryError);
    expect(fake.callsTo("sections", "select")).toHaveLength(0);
  });
});

describe("parent child scope", () => {
  it("parent reads linked child's attendance (Rahul)", async () => {
    const { records } = await getStudentAttendance(db(), parentCtx(), "s1", {
      page: 1,
      limit: 50,
    });
    expect(records.map((r) => r.status)).toEqual(["PRESENT"]);
    expect(records[0]?.date).toBe("2026-09-24");
  });

  it("parent cannot read an unlinked student's attendance", async () => {
    await expect(
      getStudentAttendance(db(), parentCtx(), "s2", { page: 1, limit: 50 }),
    ).rejects.toThrow(TenantBoundaryError);
    await expect(
      getStudentSummary(db(), parentCtx(), "s2", {}),
    ).rejects.toThrow(TenantBoundaryError);
  });

  it("parent cannot read another school's student's attendance (404)", async () => {
    await expect(
      getStudentAttendance(db(), parentCtx(), "sb1", { page: 1, limit: 50 }),
    ).rejects.toThrow(NotFoundError);
  });

  it("parent cannot save attendance (read-only role)", async () => {
    const fake = createFakeDb(seed());
    await expect(
      saveAttendance(fake as unknown as DbClient, parentCtx(), "sec7a", {
        date: "2026-09-25",
        records: [{ studentId: "s1", status: "PRESENT" }],
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("attendance_sessions")).toHaveLength(0);
    expect(fake.callsTo("attendance_records")).toHaveLength(0);
  });
});

describe("attendance save + duplicate session prevention", () => {
  it("creates a session and records (batched upsert)", async () => {
    const fake = createFakeDb(seed());
    const result = await saveAttendance(fake as unknown as DbClient, teacherCtx(), "sec7a", {
      date: TODAY,
      records: [{ studentId: "s1", status: "PRESENT" }],
    });
    expect(result.saved).toBe(1);
    // A fresh session reports each status as a change from null (new marks).
    expect(result.changed).toBe(1);
    const sessions = fake.callsTo("attendance_sessions", "upsert");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.onConflict).toBe("section_id,attendance_date");
    const recUpserts = fake.callsTo("attendance_records", "upsert");
    expect(recUpserts).toHaveLength(1); // ONE batched call, not N
    expect(recUpserts[0]?.onConflict).toBe("attendance_session_id,student_id");
    // Session is scoped to the session school + section + year.
    expect(sessions[0]?.payload).toMatchObject({
      school_id: A,
      section_id: "sec7a",
      academic_year_id: "y1",
      status: "SUBMITTED",
    });
  });

  it("saving twice for the same section/date reopens ONE session (no duplicate)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await saveAttendance(client, teacherCtx(), "sec7a", {
      date: TODAY,
      records: [{ studentId: "s1", status: "PRESENT" }],
    });
    await saveAttendance(client, teacherCtx(), "sec7a", {
      date: TODAY,
      records: [{ studentId: "s1", status: "ABSENT" }],
    });
    // Exactly two session upserts targeting the same section+date — the DB
    // UNIQUE(section_id, attendance_date) dedupes; the second save REOPENS
    // (updated_by reflects the latest saver, session count stays one).
    const upserts = fake.callsTo("attendance_sessions", "upsert");
    expect(upserts).toHaveLength(2);
    expect(upserts[1]?.payload).toMatchObject({
      section_id: "sec7a",
      attendance_date: TODAY,
      updated_by: "u-teacher",
    });
  });

  it("audits creation and changes with old/new statuses", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    // Creation for a fresh date.
    await saveAttendance(client, teacherCtx(), "sec7a", {
      date: TODAY,
      records: [{ studentId: "s1", status: "PRESENT" }],
    });
    // Correction for the existing 2026-09-24 session (s1 was PRESENT).
    await saveAttendance(client, teacherCtx(), "sec7a", {
      date: "2026-09-24",
      records: [{ studentId: "s1", status: "ABSENT" }],
    });
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits).toHaveLength(2);
    expect(audits[0]?.payload).toMatchObject({
      school_id: A,
      action: "attendance.created",
    });
    expect(audits[1]?.payload).toMatchObject({
      school_id: A,
      action: "attendance.updated",
    });
    const metadata = (audits[1]?.payload as Row)["metadata"] as {
      changed: { studentId: string; from: string; to: string }[];
    };
    expect(metadata.changed).toEqual([
      { studentId: "s1", from: "PRESENT", to: "ABSENT" },
    ]);
  });
});

describe("enrollment + relationship integrity", () => {
  it("rejects records for students not enrolled in the section for the year", async () => {
    const fake = createFakeDb(seed());
    // s3 is enrolled in sec8x, not sec7a → conflict before any write.
    await expect(
      saveAttendance(fake as unknown as DbClient, adminCtx(), "sec7a", {
        date: TODAY,
        records: [{ studentId: "s3", status: "PRESENT" }],
      }),
    ).rejects.toThrow(ConflictError);
    expect(fake.callsTo("attendance_sessions")).toHaveLength(0);
    expect(fake.callsTo("attendance_records")).toHaveLength(0);
  });

  it("rejects foreign-school students in the payload (404 via section scope)", async () => {
    // Admin saving in a School A section with sb1: sb1 is not in the roster.
    const fake = createFakeDb(seed());
    await expect(
      saveAttendance(fake as unknown as DbClient, adminCtx(), "sec7a", {
        date: TODAY,
        records: [{ studentId: "sb1", status: "PRESENT" }],
      }),
    ).rejects.toThrow(ConflictError);
    expect(fake.callsTo("attendance_records")).toHaveLength(0);
  });

  it("rejects future attendance dates", async () => {
    const fake = createFakeDb(seed());
    // A date safely beyond the +1-day tolerance (hardcoded dates rot).
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await expect(
      saveAttendance(fake as unknown as DbClient, teacherCtx(), "sec7a", {
        date: future,
        records: [{ studentId: "s1", status: "PRESENT" }],
      }),
    ).rejects.toThrow(ConflictError);
    expect(fake.callsTo("attendance_sessions")).toHaveLength(0);
  });
});

describe("summaries (server-side)", () => {
  it("student summary over a range excludes LEAVE from the denominator", async () => {
    const fake = createFakeDb(seed());
    fake.seed["attendance_records"] = [
      { id: "r1", school_id: A, attendance_session_id: "sess-old", student_id: "s1", status: "PRESENT", remark: null },
      { id: "r2", school_id: A, attendance_session_id: "sess-old", student_id: "s1", status: "ABSENT", remark: null },
      { id: "r3", school_id: A, attendance_session_id: "sess-old", student_id: "s1", status: "LEAVE", remark: null },
    ];
    const summary = await getStudentSummary(fake as unknown as DbClient, parentCtx(), "s1", {});
    expect(summary).toEqual({
      present: 1,
      absent: 1,
      leave: 1,
      total: 3,
      percentage: 50,
    });
  });

  it("section summary for a recorded date counts statuses", async () => {
    const summary = await getSectionSummary(db(), adminCtx(), "sec7a", "2026-09-24");
    expect(summary.sessionExists).toBe(true);
    expect(summary.present).toBe(1);
    expect(summary.absent).toBe(1);
    expect(summary.totalStudents).toBe(2);
    expect(summary.percentage).toBe(50);
  });

  it("section summary for an unrecorded date returns null percentage", async () => {
    const summary = await getSectionSummary(db(), adminCtx(), "sec7a", "2026-09-25");
    expect(summary.sessionExists).toBe(false);
    expect(summary.percentage).toBeNull();
  });
});
