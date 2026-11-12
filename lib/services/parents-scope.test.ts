import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { TenantBoundaryError } from "@/lib/auth/session";
import type { DbClient } from "@/lib/services/errors";
import { createFakeDb } from "@/lib/test/fake-db";
import { getParentScope, listChildren } from "@/lib/services/parents";

/**
 * getParentScope loads the parent's family in one call through
 * public.my_parent_children() (migration 0032) and falls back to the
 * separate queries when that function does not exist yet.
 */

const ctx = (id = "u-parent"): SessionContext => ({
  authUserId: `auth-${id}`,
  profile: { id, authUserId: `auth-${id}`, schoolId: "school-a", email: `${id}@x.test`, fullName: id, phone: null, isActive: true },
  school: { id: "school-a", name: "A", slug: "a", timezone: "Asia/Kolkata", logoPath: null, primaryColor: null, isActive: true },
  roles: ["PARENT"],
});

const payload = {
  parent_id: "p1",
  links: [
    {
      student_id: "s1", relation: "father", is_primary: true,
      student: { id: "s1", admission_no: "A1", display_name: "Aarav", class_id: "c9", section_id: "sec9a", roll_number: "1", status: "active", classes: { name: "Grade 9" }, sections: { name: "A" } },
    },
    { student_id: "s-other-school", relation: "father", is_primary: false, student: null },
  ],
};

function rpcDb(result: { data: unknown; error: { code: string; message: string } | null }) {
  const calls: string[] = [];
  const db = {
    rpc: async (fn: string) => {
      calls.push(`rpc:${fn}`);
      return result;
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      throw new Error("no table queries expected");
    },
  };
  return { db: db as unknown as DbClient, calls };
}

describe("getParentScope via my_parent_children()", () => {
  it("loads parent, links and children in one call", async () => {
    const { db, calls } = rpcDb({ data: payload, error: null });
    const scope = await getParentScope(db, ctx());
    expect(calls).toEqual(["rpc:my_parent_children"]);
    expect(scope?.parentId).toBe("p1");
    expect([...(scope?.studentIds ?? [])].sort()).toEqual(["s-other-school", "s1"]);
  });

  it("listChildren reuses it (no further queries) and drops children outside the school", async () => {
    const { db, calls } = rpcDb({ data: payload, error: null });
    const { children } = await listChildren(db, ctx(), "p1");
    expect(calls).toEqual(["rpc:my_parent_children"]);
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ id: "s1", displayName: "Aarav", classes: { name: "Grade 9" }, link: { relation: "father" } });
  });

  it("null payload: not a parent", async () => {
    const { db } = rpcDb({ data: null, error: null });
    expect(await getParentScope(db, ctx())).toBeNull();
    await expect(listChildren(db, ctx(), "p1")).rejects.toBeInstanceOf(TenantBoundaryError);
  });

  it("a real database error is raised, not hidden by the fallback", async () => {
    const { db } = rpcDb({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(getParentScope(db, ctx())).rejects.toThrow();
  });

  it("falls back to the separate queries when the function is missing", async () => {
    const fake = createFakeDb({
      parents: [{ id: "p1", school_id: "school-a", user_id: "u-parent", is_active: true }],
      student_parents: [{ student_id: "s1", parent_id: "p1", relation: "mother", is_primary: true }],
    });
    const db = Object.assign(fake, {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "not found" } }),
    }) as unknown as DbClient;
    const scope = await getParentScope(db, ctx());
    expect(scope?.parentId).toBe("p1");
    expect([...(scope?.studentIds ?? [])]).toEqual(["s1"]);
  });
});
