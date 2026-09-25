import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import {
  ForbiddenError,
  NotFoundError,
  TenantBoundaryError,
} from "@/lib/auth/session";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import { ConflictError } from "@/lib/services/errors";
import { addTeacherAssignment, createTeacher } from "@/lib/services/teachers";
import { linkChild, listChildren } from "@/lib/services/parents";
import {
  createSection,
  updateSection,
} from "@/lib/services/classes";
import {
  createStudent,
  getStudent,
  listStudents,
} from "@/lib/services/students";
import { addUserRole, setUserActive } from "@/lib/services/users";

/**
 * Server-boundary authorization suite for Phase 3. A programmable fake
 * stands in for PostgREST so tests assert: tenant injection, scope
 * filtering, cross-tenant 404s, and write denial. Database-level RLS and
 * tenant triggers are reviewed in migration 0003 and exercised live via
 * supabase/tests/phase3_rls.sql (no local Postgres here to run them).
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
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
      { id: "tb", school_id: B, user_id: "u-tb", employee_no: "E9", display_name: "Other", is_active: true },
    ],
    parents: [
      { id: "p1", school_id: A, user_id: "u-parent", full_name: "Rajesh", is_active: true },
      { id: "pb", school_id: B, user_id: "u-pb", full_name: "Far Parent", is_active: true },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "c8", school_id: A, name: "Grade 8" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A" },
      { id: "sec7b", school_id: A, class_id: "c7", name: "B" },
      { id: "sec8x", school_id: A, class_id: "c8", name: "X" },
      { id: "secb", school_id: B, class_id: "cb1", name: "A" },
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
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", is_current: true },
    ],
    student_enrollments: [],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin reads only own-school students (tenant injected, B excluded)", async () => {
    const fake = createFakeDb(seed());
    const { students } = await listStudents(fake as unknown as DbClient, adminCtx(), {
      page: 1,
      limit: 20,
    });
    expect(students.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    const selects = fake.callsTo("students", "select");
    expect(selects.length).toBeGreaterThan(0);
    expect(
      selects.some((c) =>
        c.filters.some((f) => f.col === "school_id" && f.val === A),
      ),
    ).toBe(true);
  });

  it("admin cannot read a School B student (404)", async () => {
    await expect(getStudent(db(), adminCtx(), "sb1")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("admin cannot manage School B records", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      linkChild(client, adminCtx(), "p1", "sb1", {
        parentId: "p1",
        relation: "guardian",
        isPrimary: false,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("student_parents", "insert")).toHaveLength(0);
  });

  it("cross-school teacher assignment is denied before insert", async () => {
    const fake = createFakeDb(seed());
    await expect(
      addTeacherAssignment(fake as unknown as DbClient, adminCtx(), "t1", {
        subjectId: "subb",
        sectionId: "sec7a",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("teacher_subjects", "insert")).toHaveLength(0);
  });

  it("cross-school class teacher is denied", async () => {
    const fake = createFakeDb(seed());
    await expect(
      updateSection(fake as unknown as DbClient, adminCtx(), "sec7a", {
        classTeacherId: "tb",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("section cannot be created under another school's class", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createSection(fake as unknown as DbClient, adminCtx(), "cb1", {
        name: "B",
        orderIndex: 0,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("sections", "insert")).toHaveLength(0);
  });
});

describe("teacher scope", () => {
  it("teacher reads only assigned sections", async () => {
    const { students } = await listStudents(db(), teacherCtx(), {
      page: 1,
      limit: 20,
    });
    expect(students.map((s) => s.id)).toEqual(["s1"]);
  });

  it("teacher reads an assigned student, not an unassigned one", async () => {
    await expect(getStudent(db(), teacherCtx(), "s1")).resolves.toBeDefined();
    await expect(getStudent(db(), teacherCtx(), "s2")).rejects.toThrow(
      TenantBoundaryError,
    );
  });

  it("teacher filtering by an unassigned section fails closed without querying", async () => {
    const fake = createFakeDb(seed());
    await expect(
      listStudents(fake as unknown as DbClient, teacherCtx(), {
        page: 1,
        limit: 20,
        sectionId: "sec7b",
      }),
    ).rejects.toThrow(TenantBoundaryError);
    expect(fake.callsTo("students", "select")).toHaveLength(0);
  });

  it("teacher without a profile sees nothing", async () => {
    const ctx = baseCtx(["TEACHER"], "u-nobody");
    const { students, total } = await listStudents(db(), ctx, {
      page: 1,
      limit: 20,
    });
    expect(students).toEqual([]);
    expect(total).toBe(0);
  });
});

describe("parent scope", () => {
  it("parent reads the linked child, not unlinked or foreign children", async () => {
    const client = db();
    const { students } = await listStudents(client, parentCtx(), {
      page: 1,
      limit: 20,
    });
    expect(students.map((s) => s.id)).toEqual(["s1"]);
    await expect(getStudent(client, parentCtx(), "s1")).resolves.toBeDefined();
    await expect(getStudent(client, parentCtx(), "s2")).rejects.toThrow(
      TenantBoundaryError,
    );
    await expect(getStudent(client, parentCtx(), "sb1")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("a parent cannot list another parent's children", async () => {
    const other = baseCtx(["PARENT"], "u-stranger");
    // Stranger has no parent profile → scope resolution denies.
    await expect(listChildren(db(), other, "p1")).rejects.toThrow(
      TenantBoundaryError,
    );
  });
});

describe("relationship integrity (service layer; triggers backstop live)", () => {
  it("a student cannot be linked to a parent from another school", async () => {
    const fake = createFakeDb(seed());
    // Parent in B is invisible to school-A admin…
    await expect(
      linkChild(fake as unknown as DbClient, adminCtx(), "pb", "s1", {
        parentId: "pb",
        relation: "guardian",
        isPrimary: false,
      }),
    ).rejects.toThrow(NotFoundError);
    // …and a B student is invisible too.
    await expect(
      linkChild(fake as unknown as DbClient, adminCtx(), "p1", "sb1", {
        parentId: "p1",
        relation: "guardian",
        isPrimary: false,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("student_parents", "insert")).toHaveLength(0);
  });

  it("a student section must belong to its class", async () => {
    await expect(
      createStudent(db(), adminCtx(), {
        admissionNo: "N1",
        firstName: "New",
        lastName: "Kid",
        classId: "c7",
        sectionId: "sec8x",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("admin boundaries", () => {
  it("non-admins cannot write people records", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createStudent(client, teacherCtx(), {
        admissionNo: "N9",
        firstName: "No",
        lastName: "Way",
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createStudent(client, parentCtx(), {
        admissionNo: "N9",
        firstName: "No",
        lastName: "Way",
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("students", "insert")).toHaveLength(0);
  });

  it("SCHOOL_ADMIN can never be granted by an admin (deny escalation)", async () => {
    await expect(
      addUserRole(db(), adminCtx(), "u-teacher", "SCHOOL_ADMIN"),
    ).rejects.toThrow(ConflictError);
  });

  it("non-admins cannot grant roles", async () => {
    await expect(
      addUserRole(db(), teacherCtx(), "u-teacher", "TEACHER"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("admins cannot deactivate themselves", async () => {
    await expect(setUserActive(db(), adminCtx(), "u-admin", false)).rejects.toThrow(
      ConflictError,
    );
  });

  it("duplicate employee numbers conflict", async () => {
    const fake = createFakeDb(seed());
    fake.failNext = { code: "23505", message: 'duplicate key "teachers_school_employee"' };
    await expect(
      createTeacher(fake as unknown as DbClient, adminCtx(), {
        employeeNo: "E1",
        firstName: "Dup",
        lastName: "Licate",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("mutations are audited with the session school", async () => {
    const fake = createFakeDb(seed());
    await createTeacher(fake as unknown as DbClient, adminCtx(), {
      employeeNo: "E5",
      firstName: "Audit",
      lastName: "Me",
    });
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.payload).toMatchObject({
      school_id: A,
      action: "teacher.created",
    });
  });
});
