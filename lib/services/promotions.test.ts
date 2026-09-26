import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import {
  previewPromotion,
  promoteStudents,
} from "@/lib/services/promotions";

/**
 * Server-boundary authorization suite for Phase 12 promotions. Rules tested:
 * historical enrollment preserved, correct next class (order_index),
 * duplicate promotion prevented, cross-school denial, admin-only, section
 * changed independently, final-class graduation.
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
const admin2Ctx = () => baseCtx(["SCHOOL_ADMIN"], "u-admin2");
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");

function seed(): Record<string, Row[]> {
  return {
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
    ],
    parents: [],
    users: [
      { id: "u-admin", school_id: A, email: "a@a.example", full_name: "Admin", is_active: true },
      { id: "u-admin2", school_id: A, email: "a2@a.example", full_name: "Admin2", is_active: true },
      { id: "u-admin-b", school_id: B, email: "ab@b.example", full_name: "AdminB", is_active: true },
    ],
    user_roles: [
      { user_id: "u-admin", role: "SCHOOL_ADMIN" },
      { user_id: "u-admin2", role: "SCHOOL_ADMIN" },
      { user_id: "u-admin-b", role: "SCHOOL_ADMIN" },
    ],
    classes: [
      // order_index 5 (Grade 6) → 6 (Grade 7) → 7 (Grade 8, final class)
      {
        id: "c6", school_id: A, name: "Grade 6", order_index: 5,
        sections: [
          { id: "sec6a", name: "A" },
          { id: "sec6b", name: "B" },
        ],
      },
      {
        id: "c7", school_id: A, name: "Grade 7", order_index: 6,
        sections: [
          { id: "sec7a", name: "A" },
          { id: "sec7b", name: "B" },
        ],
      },
      {
        id: "c8", school_id: A, name: "Grade 8", order_index: 7, // FINAL
        sections: [{ id: "sec8a", name: "A" }],
      },
      {
        id: "cb1", school_id: B, name: "Grade 1", order_index: 0,
        sections: [{ id: "secb", name: "A" }],
      },
    ],
    sections: [
      { id: "sec6a", school_id: A, class_id: "c6", name: "A", is_active: true },
      { id: "sec6b", school_id: A, class_id: "c6", name: "B", is_active: true },
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", is_active: true },
      { id: "sec7b", school_id: A, class_id: "c7", name: "B", is_active: true },
      { id: "sec8a", school_id: A, class_id: "c8", name: "A", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Sonia", class_id: "c6", section_id: "sec6a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Rahul", class_id: "c6", section_id: "sec6b", status: "active" },
      { id: "s3", school_id: A, admission_no: "A3", display_name: "Final Kid", class_id: "c8", section_id: "sec8a", status: "active" },
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "y2", school_id: A, name: "2027-28", starts_on: "2027-04-01", ends_on: "2028-03-31", is_current: false },
      { id: "yb1", school_id: B, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "yb2", school_id: B, name: "2027-28", starts_on: "2027-04-01", ends_on: "2028-03-31", is_current: false },
    ],
    student_enrollments: [
      {
        id: "e1", school_id: A, student_id: "s1", academic_year_id: "y1",
        class_id: "c6", section_id: "sec6a", roll_number: "10", status: "enrolled",
        students: { id: "s1", admission_no: "A1", display_name: "Sonia", class_id: "c6", status: "active" },
      },
      {
        id: "e2", school_id: A, student_id: "s2", academic_year_id: "y1",
        class_id: "c6", section_id: "sec6b", roll_number: "11", status: "enrolled",
        students: { id: "s2", admission_no: "A2", display_name: "Rahul", class_id: "c6", status: "active" },
      },
      {
        id: "e3", school_id: A, student_id: "s3", academic_year_id: "y1",
        class_id: "c8", section_id: "sec8a", roll_number: "1", status: "enrolled",
        students: { id: "s3", admission_no: "A3", display_name: "Final Kid", class_id: "c8", status: "active" },
      },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("promotion preview", () => {
  it("proposes the next class by order_index + same-name section", async () => {
    const preview = await previewPromotion(db(), adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
    });
    const s1 = preview.proposals.find((p) => p.studentId === "s1");
    // Grade 6 (order 5) → Grade 7 (order 6); section A → 7A (same name).
    expect(s1?.nextClassId).toBe("c7");
    expect(s1?.nextSectionId).toBe("sec7a");
    expect(s1?.action).toBe("PROMOTE");
    const s2 = preview.proposals.find((p) => p.studentId === "s2");
    // Section B → no "B" section exists in Grade 7? It does (sec7b) → same name.
    expect(s2?.nextSectionId).toBe("sec7b");
  });

  it("final-class students get a GRADUATE proposal (no invalid next class)", async () => {
    const preview = await previewPromotion(db(), adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
    });
    const s3 = preview.proposals.find((p) => p.studentId === "s3");
    expect(s3?.action).toBe("GRADUATE");
    expect(s3?.nextClassId).toBeNull();
  });

  it("cross-school years are denied (404)", async () => {
    await expect(
      previewPromotion(db(), adminCtx(), { fromYearId: "yb1", toYearId: "y2" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      previewPromotion(db(), adminCtx(), { fromYearId: "y1", toYearId: "yb2" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("non-admins cannot preview (admin-only)", async () => {
    await expect(
      previewPromotion(db(), teacherCtx(), { fromYearId: "y1", toYearId: "y2" }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("promotion run", () => {
  it("promotes with history preserved (new enrollment row, pointer repointed)", async () => {
    const fake = createFakeDb(seed());
    const result = await promoteStudents(fake as unknown as DbClient, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "s1", nextClassId: "c7", nextSectionId: "sec7a", hold: false },
      ],
    });
    expect(result.promoted).toBe(1);
    // NEW enrollment row for y2; the y1 row is UNTOUCHED (history preserved).
    const enrollments = fake.seed["student_enrollments"] as Row[];
    expect(enrollments).toHaveLength(4); // e1..e3 + new
    const y1Row = enrollments.find((r) => r["id"] === "e1");
    expect(y1Row).toMatchObject({ class_id: "c6", section_id: "sec6a" }); // unchanged
    const y2Row = enrollments.find(
      (r) => r["academic_year_id"] === "y2" && r["student_id"] === "s1",
    );
    expect(y2Row).toMatchObject({ class_id: "c7", section_id: "sec7a", status: "enrolled" });
    // Current placement repointed.
    const s1 = (fake.seed["students"] as Row[]).find((r) => r["id"] === "s1");
    expect(s1).toMatchObject({ class_id: "c7", section_id: "sec7a" });
  });

  it("duplicate promotion is prevented (409)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    // First promotion succeeds…
    await promoteStudents(client, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "s1", nextClassId: "c7", nextSectionId: "sec7a", hold: false },
      ],
    });
    // …second one for the same student+year conflicts.
    const result = await promoteStudents(client, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "s1", nextClassId: "c7", nextSectionId: "sec7a", hold: false },
      ],
    });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.message).toMatch(/already has an enrollment/);
    expect((fake.seed["student_enrollments"] as Row[])).toHaveLength(4); // no duplicate row
  });

  it("hold/retain creates no enrollment and is audited", async () => {
    const fake = createFakeDb(seed());
    const result = await promoteStudents(fake as unknown as DbClient, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [{ studentId: "s1", hold: true }],
    });
    expect(result.held).toBe(1);
    expect(result.promoted).toBe(0);
    expect((fake.seed["student_enrollments"] as Row[])).toHaveLength(3); // unchanged
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.some((a) => (a.payload as Row)["action"] === "promotion.held")).toBe(true);
  });

  it("final-class students graduate safely (no invalid enrollment)", async () => {
    const fake = createFakeDb(seed());
    const result = await promoteStudents(fake as unknown as DbClient, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [{ studentId: "s3", hold: false }], // no next class → graduate
    });
    expect(result.graduated).toBe(1);
    expect(result.promoted).toBe(0);
    const s3 = (fake.seed["students"] as Row[]).find((r) => r["id"] === "s3");
    expect(s3?.["status"]).toBe("graduated");
    expect((fake.seed["student_enrollments"] as Row[])).toHaveLength(3);
  });

  it("section can be changed independently of the proposed default", async () => {
    const fake = createFakeDb(seed());
    // s1 (6A) promoted to 7B (changed from the proposed 7A).
    await promoteStudents(fake as unknown as DbClient, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "s1", nextClassId: "c7", nextSectionId: "sec7b", hold: false },
      ],
    });
    const y2Row = (fake.seed["student_enrollments"] as Row[]).find(
      (r) => r["academic_year_id"] === "y2",
    );
    expect(y2Row).toMatchObject({ section_id: "sec7b" });
  });

  it("cross-school promotion is denied (student/class/section)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    // School B student.
    let result = await promoteStudents(client, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "sb1", nextClassId: "c7", nextSectionId: "sec7a", hold: false },
      ],
    });
    expect(result.failed[0]?.message).toMatch(/not found in this school/);
    expect((fake.seed["student_enrollments"] as Row[])).toHaveLength(3);
    // School B class as the next class.
    result = await promoteStudents(client, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "s1", nextClassId: "cb1", nextSectionId: "sec7a", hold: false },
      ],
    });
    expect(result.failed[0]?.message).toMatch(/not found in this school/);
    // Section from another class (integrity).
    result = await promoteStudents(client, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "s1", nextClassId: "c7", nextSectionId: "sec6a", hold: false },
      ],
    });
    expect(result.failed[0]?.message).toMatch(/does not belong/);
  });

  it("non-admins cannot promote (admin-only)", async () => {
    await expect(
      promoteStudents(db(), teacherCtx(), {
        fromYearId: "y1",
        toYearId: "y2",
        assignments: [{ studentId: "s1", nextClassId: "c7", nextSectionId: null, hold: false }],
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("per-student failures don't abort the batch; run is audited", async () => {
    const fake = createFakeDb(seed());
    const result = await promoteStudents(fake as unknown as DbClient, adminCtx(), {
      fromYearId: "y1",
      toYearId: "y2",
      assignments: [
        { studentId: "sb1", hold: false }, // fails (cross-school)
        { studentId: "s1", nextClassId: "c7", nextSectionId: "sec7a", hold: false }, // succeeds
      ],
    });
    expect(result.promoted).toBe(1);
    expect(result.failed).toHaveLength(1);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.some((a) => (a.payload as Row)["action"] === "promotion.approved")).toBe(true);
    expect(audits.some((a) => (a.payload as Row)["action"] === "promotion.run")).toBe(true);
  });
});
