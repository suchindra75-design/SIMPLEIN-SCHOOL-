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
  createTimetableSlot,
  deleteTimetableSlot,
  listMyTimetable,
  listSectionTimetable,
  listTeacherTimetable,
  updateTimetableSlot,
} from "@/lib/services/timetable";

/**
 * Server-boundary authorization suite for Phase 8 timetable. A programmable
 * fake stands in for PostgREST so tests assert tenant injection, teacher/
 * parent scope, conflict prevention (section overlap + teacher double-
 * booking), time-range validity, and write denial. Database-level RLS,
 * UNIQUE indexes, and tenant triggers are reviewed in migration 0008 and
 * exercised live via supabase/tests/phase8_rls.sql (no local Postgres here).
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
      primaryColor: null,
      isActive: true,
    },
    roles,
  };
}

const adminCtx = () => baseCtx(["SCHOOL_ADMIN"]);
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(): Record<string, Row[]> {
  // t1: class teacher of sec7a; t2: assigned sec7b only.
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
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", class_teacher_id: "t1", is_active: true },
      { id: "sec7b", school_id: A, class_id: "c7", name: "B", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "sub-e", school_id: A, name: "English" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [
      { id: "ts2", school_id: A, teacher_id: "t2", subject_id: "sub-e", section_id: "sec7b" },
    ],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Rahul", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Ananya", class_id: "c7", section_id: "sec7b", status: "active" },
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "yb", school_id: B, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    ],
    timetable_slots: [
      {
        id: "slot1", school_id: A, academic_year_id: "y1", section_id: "sec7a",
        subject_id: "sub-m", teacher_id: "t1", day_of_week: 1, period_index: 0,
        starts_at: "09:30", ends_at: "10:10", room: "R1",
        subjects: { name: "Math" }, teachers: { display_name: "Ravi" },
      },
      {
        id: "slot2", school_id: A, academic_year_id: "y1", section_id: "sec7a",
        subject_id: "sub-e", teacher_id: "t2", day_of_week: 1, period_index: 1,
        starts_at: "10:20", ends_at: "11:00", room: "R1",
        subjects: { name: "English" }, teachers: { display_name: "Priya" },
      },
      {
        id: "slotb", school_id: B, academic_year_id: "yb", section_id: "secb",
        subject_id: "subb", teacher_id: "tb", day_of_week: 1, period_index: 0,
        starts_at: "09:30", ends_at: "10:10", room: "RB",
        subjects: { name: "Art" }, teachers: { display_name: "Other" },
      },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin views own-school section timetables only", async () => {
    const { slots } = await listSectionTimetable(db(), adminCtx(), "sec7a");
    expect(slots.map((s) => s.id)).toEqual(["slot1", "slot2"]);
  });

  it("admin cannot view a School B section timetable (404)", async () => {
    await expect(listSectionTimetable(db(), adminCtx(), "secb")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("admin cannot create a slot under a School B section (404)", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createTimetableSlot(fake as unknown as DbClient, adminCtx(), "secb", {
        subjectId: "sub-m",
        teacherId: null,
        dayOfWeek: 2,
        periodIndex: 0,
        startsAt: "09:30",
        endsAt: "10:10",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("timetable_slots", "insert")).toHaveLength(0);
  });

  it("admin cannot edit/delete a School B slot (404)", async () => {
    await expect(
      updateTimetableSlot(db(), adminCtx(), "slotb", { room: "X" }),
    ).rejects.toThrow(NotFoundError);
    await expect(deleteTimetableSlot(db(), adminCtx(), "slotb")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("teacher access scope", () => {
  it("teacher views only their assigned sections' timetables", async () => {
    // t1 is class teacher of sec7a.
    const { slots } = await listMyTimetable(db(), teacherCtx());
    expect(slots.map((s) => s.id)).toEqual(["slot1"]);
    const { slots: scoped } = await listSectionTimetable(db(), teacherCtx(), "sec7a");
    expect(scoped).toHaveLength(2); // own section fully visible
  });

  it("teacher cannot view an unassigned section's timetable — 404", async () => {
    await expect(listSectionTimetable(db(), teacherCtx(), "sec7b")).rejects.toThrow(
      TenantBoundaryError,
    );
  });

  it("teacher cannot view another teacher's timetable (self only) — 404", async () => {
    await expect(listTeacherTimetable(db(), teacherCtx(), "t2")).rejects.toThrow(
      TenantBoundaryError,
    );
  });
});

describe("parent linked-child scope", () => {
  it("parent views the linked child's section timetable", async () => {
    const { slots } = await listSectionTimetable(db(), parentCtx(), "sec7a");
    expect(slots.map((s) => s.id)).toEqual(["slot1", "slot2"]);
  });

  it("parent cannot view an unlinked child's section timetable — 404", async () => {
    // sec7b holds s2 (NOT linked to p1).
    await expect(listSectionTimetable(db(), parentCtx(), "sec7b")).rejects.toThrow(
      TenantBoundaryError,
    );
    await expect(listSectionTimetable(db(), parentCtx(), "secb")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("conflict prevention", () => {
  it("section overlap is prevented (UNIQUE section+day+period → 409)", async () => {
    const fake = createFakeDb(seed());
    fake.failOn = {
      table: "timetable_slots",
      op: "insert",
      code: "23505",
      message: 'duplicate key "timetable_slots_section_day_period"',
    };
    await expect(
      createTimetableSlot(fake as unknown as DbClient, adminCtx(), "sec7a", {
        subjectId: "sub-e",
        teacherId: null,
        dayOfWeek: 1,
        periodIndex: 0, // slot1 already holds sec7a day 1 period 0
        startsAt: "11:00",
        endsAt: "11:40",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("teacher double-booking is prevented (same day+period, another section)", async () => {
    // t1 teaches sec7a day1 period0 (slot1); assigning t1 to sec7b day1 period0 clashes.
    await expect(
      createTimetableSlot(db(), adminCtx(), "sec7b", {
        subjectId: "sub-m",
        teacherId: "t1",
        dayOfWeek: 1,
        periodIndex: 0,
        startsAt: "09:30",
        endsAt: "10:10",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("teacher clash on update is prevented (excluding the slot itself)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    // t2 gets a second slot (sec7b, day1 p2) — fine.
    const { id: slot3 } = await createTimetableSlot(client, adminCtx(), "sec7b", {
      subjectId: "sub-m",
      teacherId: "t2",
      dayOfWeek: 1,
      periodIndex: 2,
      startsAt: "11:10",
      endsAt: "11:50",
    });
    // Moving slot3 to period 1 clashes: t2 already holds slot2 (day1 p1).
    await expect(
      updateTimetableSlot(client, adminCtx(), slot3, { periodIndex: 1 }),
    ).rejects.toThrow(ConflictError);
    // Re-pointing slot3 to t1 (no day1 p2 slot) is fine — no clash.
    await expect(
      updateTimetableSlot(client, adminCtx(), slot3, { teacherId: "t1" }),
    ).resolves.toBeDefined();
  });

  it("invalid time ranges are rejected", async () => {
    await expect(
      createTimetableSlot(db(), adminCtx(), "sec7a", {
        subjectId: "sub-m",
        teacherId: null,
        dayOfWeek: 3,
        periodIndex: 0,
        startsAt: "10:30",
        endsAt: "09:30", // end before start
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      createTimetableSlot(db(), adminCtx(), "sec7a", {
        subjectId: "sub-m",
        teacherId: null,
        dayOfWeek: 3,
        periodIndex: 0,
        startsAt: "10:30",
        endsAt: "10:30", // equal
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("cross-school subject/teacher references are denied", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createTimetableSlot(fake as unknown as DbClient, adminCtx(), "sec7a", {
        subjectId: "subb",
        teacherId: null,
        dayOfWeek: 3,
        periodIndex: 0,
        startsAt: "09:30",
        endsAt: "10:10",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      createTimetableSlot(fake as unknown as DbClient, adminCtx(), "sec7a", {
        subjectId: "sub-m",
        teacherId: "tb",
        dayOfWeek: 3,
        periodIndex: 0,
        startsAt: "09:30",
        endsAt: "10:10",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("timetable_slots", "insert")).toHaveLength(0);
  });
});

describe("unauthorized modifications", () => {
  it("teacher cannot create/update/delete timetable entries", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createTimetableSlot(client, teacherCtx(), "sec7a", {
        subjectId: "sub-m",
        teacherId: null,
        dayOfWeek: 3,
        periodIndex: 0,
        startsAt: "09:30",
        endsAt: "10:10",
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateTimetableSlot(client, teacherCtx(), "slot1", { room: "X" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(deleteTimetableSlot(client, teacherCtx(), "slot1")).rejects.toThrow(
      ForbiddenError,
    );
    expect(fake.callsTo("timetable_slots", "insert")).toHaveLength(0);
    expect(fake.callsTo("timetable_slots", "update")).toHaveLength(0);
    expect(fake.callsTo("timetable_slots", "delete")).toHaveLength(0);
  });

  it("parent cannot create/update/delete timetable entries", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createTimetableSlot(client, parentCtx(), "sec7a", {
        subjectId: "sub-m",
        teacherId: null,
        dayOfWeek: 3,
        periodIndex: 0,
        startsAt: "09:30",
        endsAt: "10:10",
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("timetable_slots", "insert")).toHaveLength(0);
  });
});

describe("audit logging", () => {
  it("audits slot create/update/delete with the session school", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await createTimetableSlot(client, adminCtx(), "sec7a", {
      subjectId: "sub-m",
      teacherId: null,
      dayOfWeek: 4,
      periodIndex: 2,
      startsAt: "12:00",
      endsAt: "12:40",
    });
    await updateTimetableSlot(client, adminCtx(), "slot1", { room: "R9" });
    await deleteTimetableSlot(client, adminCtx(), "slot2");
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.map((a) => (a.payload as Row)["action"])).toEqual([
      "timetable.slot_created",
      "timetable.slot_updated",
      "timetable.slot_deleted",
    ]);
    expect(audits[0]?.payload).toMatchObject({ school_id: A });
  });
});
