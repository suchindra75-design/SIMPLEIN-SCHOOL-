import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import { listUsers } from "@/lib/services/users";

/**
 * Regression suite for the Phase 14.5 role-filter fix: filtering the user
 * directory by role cannot join user_roles inline (two FKs to users make the
 * embed ambiguous), so listUsers resolves matching ids first.
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

function seed(): Record<string, Row[]> {
  return {
    users: [
      { id: "u-admin", school_id: A, email: "a@x", full_name: "Admin", is_active: true },
      { id: "u-teacher", school_id: A, email: "t@x", full_name: "Teach", is_active: true },
      { id: "u-parent", school_id: A, email: "p@x", full_name: "Par", is_active: true },
      { id: "u-tb", school_id: B, email: "tb@x", full_name: "Far", is_active: true },
    ],
    user_roles: [
      { user_id: "u-admin", role: "SCHOOL_ADMIN", users: { school_id: A } },
      { user_id: "u-teacher", role: "TEACHER", users: { school_id: A } },
      { user_id: "u-parent", role: "PARENT", users: { school_id: A } },
      { user_id: "u-tb", role: "TEACHER", users: { school_id: B } },
    ],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("role filter", () => {
  it("returns only same-school users holding the role", async () => {
    const { users, total } = await listUsers(db(), adminCtx(), { role: "TEACHER", page: 1, limit: 50 });
    expect(total).toBe(1);
    expect(users.map((u) => u.id)).toEqual(["u-teacher"]);
  });

  it("returns everyone without a role filter", async () => {
    const { users, total } = await listUsers(db(), adminCtx(), { page: 1, limit: 50 });
    expect(total).toBe(3);
    expect(users.map((u) => u.id).sort()).toEqual(["u-admin", "u-parent", "u-teacher"]);
  });
});
