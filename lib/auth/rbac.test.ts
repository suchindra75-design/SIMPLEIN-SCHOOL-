import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/auth/rbac";

/**
 * Foundation RBAC tests. Expanded per-module in roadmap steps 2-6;
 * tenant-isolation suites (SQL-level RLS + cross-school API tests) are
 * mandatory gates before pilot — see docs/ARCHITECTURE.md §15.
 */
describe("hasPermission", () => {
  it("grants school admin full control", () => {
    expect(hasPermission(["SCHOOL_ADMIN"], "students", "manage")).toBe(true);
    expect(hasPermission(["SCHOOL_ADMIN"], "fees", "manage")).toBe(true);
  });

  it("denies teachers admin-only management", () => {
    expect(hasPermission(["TEACHER"], "users", "manage")).toBe(false);
    expect(hasPermission(["TEACHER"], "fees", "write")).toBe(false);
  });

  it("allows teachers attendance/marks writes (link-scoped at request level)", () => {
    expect(hasPermission(["TEACHER"], "attendance", "write")).toBe(true);
    expect(hasPermission(["TEACHER"], "marks", "write")).toBe(true);
  });

  it("restricts parents to reads", () => {
    expect(hasPermission(["PARENT"], "marks", "read")).toBe(true);
    expect(hasPermission(["PARENT"], "marks", "write")).toBe(false);
    expect(hasPermission(["PARENT"], "fees", "read")).toBe(true);
  });

  it("STUDENT (activated Phase 12): self-only reads, never writes", () => {
    expect(hasPermission(["STUDENT"], "notices", "read")).toBe(true);
    expect(hasPermission(["STUDENT"], "marks", "read")).toBe(true);
    expect(hasPermission(["STUDENT"], "fees", "read")).toBe(true);
    expect(hasPermission(["STUDENT"], "marks", "write")).toBe(false);
    expect(hasPermission(["STUDENT"], "notices", "write")).toBe(false);
    expect(hasPermission(["STUDENT"], "fees", "manage")).toBe(false);
    expect(hasPermission(["STUDENT"], "users", "read")).toBe(false);
  });

  it("denies unknown combinations", () => {
    expect(hasPermission([], "students", "read")).toBe(false);
    expect(hasPermission(["PARENT"], "users", "read")).toBe(false);
  });
});
