import { describe, expect, it, vi } from "vitest";
import { resolveIdentifierToEmail } from "@/lib/services/identity";

// Mock createAdminClient from @/lib/supabase/admin
vi.mock("@/lib/supabase/admin", () => {
  const students = [
    { id: "st-1", school_id: "sch-1", user_id: "u-student-1", admission_no: "S-2026-001", status: "active" },
    { id: "st-2", school_id: "sch-1", user_id: "u-student-2", admission_no: "S-2026-002", status: "inactive" },
  ];
  const parents = [
    { id: "p-1", school_id: "sch-1", user_id: "u-parent-1", phone: "9876543210", is_active: true },
    { id: "p-2", school_id: "sch-1", user_id: "u-parent-2", phone: "9876543211", is_active: false },
  ];
  const teachers = [
    { id: "t-1", school_id: "sch-1", user_id: "u-teacher-1", employee_no: "T-1001", is_active: true },
    { id: "t-2", school_id: "sch-1", user_id: "u-teacher-2", employee_no: "T-1002", is_active: false },
  ];
  const users = [
    { id: "u-student-1", email: "student1@school.demo", is_active: true, phone: null },
    { id: "u-student-2", email: "student2@school.demo", is_active: false, phone: null },
    { id: "u-parent-1", email: "parent1@school.demo", is_active: true, phone: "9876543210" },
    { id: "u-parent-2", email: "parent2@school.demo", is_active: false, phone: "9876543211" },
    { id: "u-teacher-1", email: "teacher1@school.demo", is_active: true, phone: null },
    { id: "u-teacher-2", email: "teacher2@school.demo", is_active: false, phone: null },
  ];

  return {
    createAdminClient: () => ({
      from: (table: string) => {
        let currentRows: any[] = [];
        if (table === "students") currentRows = [...students];
        if (table === "parents") currentRows = [...parents];
        if (table === "teachers") currentRows = [...teachers];
        if (table === "users") currentRows = [...users];

        const queryBuilder: any = {
          select: () => queryBuilder,
          eq: (field: string, val: any) => {
            currentRows = currentRows.filter((r) => r[field] === val);
            return queryBuilder;
          },
          ilike: (field: string, val: any) => {
            currentRows = currentRows.filter(
              (r) => String(r[field]).toLowerCase() === String(val).toLowerCase(),
            );
            return queryBuilder;
          },
          or: (condStr: string) => {
            // Simple OR parser for phone checks
            const phones = condStr.split(",").map((s) => s.split(".")[2]);
            currentRows = currentRows.filter((r) => phones.includes(r.phone));
            return queryBuilder;
          },
          not: (field: string, op: string, val: any) => {
            if (op === "is" && val === null) {
              currentRows = currentRows.filter((r) => r[field] !== null && r[field] !== undefined);
            }
            return queryBuilder;
          },
          single: async () => ({
            data: currentRows[0] ?? null,
            error: currentRows.length === 0 ? { message: "Not found" } : null,
          }),
          maybeSingle: async () => ({
            data: currentRows[0] ?? null,
            error: null,
          }),
        };
        return queryBuilder;
      },
    }),
  };
});

describe("Identity Resolution Service", () => {
  it("resolves Student admission number to user email", async () => {
    const result = await resolveIdentifierToEmail("STUDENT", "S-2026-001");
    expect(result).toEqual({ email: "student1@school.demo" });
  });

  it("handles case-insensitive and whitespace-padded student admission numbers", async () => {
    const result = await resolveIdentifierToEmail("STUDENT", "  s-2026-001  ");
    expect(result).toEqual({ email: "student1@school.demo" });
  });

  it("fails resolution for inactive student", async () => {
    const result = await resolveIdentifierToEmail("STUDENT", "S-2026-002");
    expect(result).toBeNull();
  });

  it("fails resolution for non-existent student admission number", async () => {
    const result = await resolveIdentifierToEmail("STUDENT", "NON-EXISTENT");
    expect(result).toBeNull();
  });

  it("resolves Parent mobile number to user email", async () => {
    const result = await resolveIdentifierToEmail("PARENT", "9876543210");
    expect(result).toEqual({ email: "parent1@school.demo" });
  });

  it("fails resolution for inactive parent", async () => {
    const result = await resolveIdentifierToEmail("PARENT", "9876543211");
    expect(result).toBeNull();
  });

  it("resolves Teacher employee/facility ID to user email", async () => {
    const result = await resolveIdentifierToEmail("TEACHER", "T-1001");
    expect(result).toEqual({ email: "teacher1@school.demo" });
  });

  it("fails resolution for inactive teacher", async () => {
    const result = await resolveIdentifierToEmail("TEACHER", "T-1002");
    expect(result).toBeNull();
  });

  it("passes Admin email directly through", async () => {
    const result = await resolveIdentifierToEmail("ADMIN", "Admin@School.Demo");
    expect(result).toEqual({ email: "admin@school.demo" });
  });

  it("handles email fallback across any role if email format is entered", async () => {
    const result = await resolveIdentifierToEmail("STUDENT", "direct@school.demo");
    expect(result).toEqual({ email: "direct@school.demo" });
  });

  it("returns null for empty identifier", async () => {
    const result = await resolveIdentifierToEmail("STUDENT", "   ");
    expect(result).toBeNull();
  });
});
