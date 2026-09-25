import { describe, expect, it } from "vitest";
import {
  assertCanWritePeople,
  assertParentStudentAccess,
  assertTeacherSectionAccess,
  isAdmin,
  teacherSectionIds,
} from "@/lib/auth/scope";
import {
  ForbiddenError,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";

function ctx(roles: SessionContext["roles"]): SessionContext {
  return {
    authUserId: "auth-1",
    profile: {
      id: "u-1",
      authUserId: "auth-1",
      schoolId: "school-a",
      email: "u@example.com",
      fullName: "U",
      phone: null,
      isActive: true,
    },
    school: {
      id: "school-a",
      name: "A",
      slug: "a",
      timezone: "Asia/Kolkata",
      logoPath: null,
      isActive: true,
    },
    roles,
  };
}

describe("scope predicates", () => {
  it("unions class-teacher and assigned sections", () => {
    const ids = teacherSectionIds({
      classTeacherSectionIds: ["s1", "s2"],
      assignedSectionIds: ["s2", "s3"],
    });
    expect([...ids].sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("admin bypasses section and student checks", () => {
    const admin = ctx(["SCHOOL_ADMIN"]);
    expect(isAdmin(admin)).toBe(true);
    expect(() =>
      assertTeacherSectionAccess(admin, "any-section", new Set()),
    ).not.toThrow();
    expect(() =>
      assertParentStudentAccess(admin, "any-student", new Set()),
    ).not.toThrow();
    expect(() => assertCanWritePeople(admin)).not.toThrow();
  });

  it("teacher reads assigned sections only", () => {
    const teacher = ctx(["TEACHER"]);
    expect(() =>
      assertTeacherSectionAccess(teacher, "sec7a", new Set(["sec7a"])),
    ).not.toThrow();
    expect(() =>
      assertTeacherSectionAccess(teacher, "sec7b", new Set(["sec7a"])),
    ).toThrow(TenantBoundaryError);
  });

  it("parent reads linked children only", () => {
    const parent = ctx(["PARENT"]);
    expect(() =>
      assertParentStudentAccess(parent, "s1", new Set(["s1", "s2"])),
    ).not.toThrow();
    expect(() =>
      assertParentStudentAccess(parent, "s9", new Set(["s1"])),
    ).toThrow(TenantBoundaryError);
  });

  it("teacher cannot reach parent-scoped data and vice versa", () => {
    expect(() =>
      assertParentStudentAccess(ctx(["TEACHER"]), "s1", new Set(["s1"])),
    ).toThrow(TenantBoundaryError);
    expect(() =>
      assertTeacherSectionAccess(ctx(["PARENT"]), "sec7a", new Set(["sec7a"])),
    ).toThrow(TenantBoundaryError);
  });

  it("only admins write people records", () => {
    expect(() => assertCanWritePeople(ctx(["TEACHER"]))).toThrow(ForbiddenError);
    expect(() => assertCanWritePeople(ctx(["PARENT"]))).toThrow(ForbiddenError);
    expect(() => assertCanWritePeople(ctx(["STUDENT"]))).toThrow(ForbiddenError);
    expect(() => assertCanWritePeople(ctx([]))).toThrow(ForbiddenError);
  });
});
