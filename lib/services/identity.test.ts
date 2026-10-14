import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIdentifierToEmail } from "@/lib/services/identity";

/**
 * In-memory stand-in for the service-role client. It follows PostgREST
 * semantics closely enough to expose lookup bugs:
 * - ilike: real LIKE matching (`%`, `_`, backslash escapes) after PostgREST's
 *   `*` → `%` rewrite;
 * - or(): parses the comma-separated filter string the way PostgREST does;
 * - maybeSingle()/single(): error when more than one row matches;
 * - `user_roles!…!inner(role)` embeds filtered by `user_roles.role`.
 * Every or() call and ilike() pattern is recorded for assertions.
 */
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    db: {} as Record<string, Row[]>,
    orCalls: [] as string[],
    ilikePatterns: [] as string[],
  };

  const escapeRegExp = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function likeToRegExp(pattern: string): RegExp {
    const p = pattern.replace(/\*/g, "%");
    let re = "";
    for (let i = 0; i < p.length; i++) {
      const c = p[i] as string;
      if (c === "\\" && i + 1 < p.length) {
        i += 1;
        re += escapeRegExp(p[i] as string);
      } else {
        re += c === "%" ? ".*" : c === "_" ? "." : escapeRegExp(c);
      }
    }
    return new RegExp(`^${re}$`, "is");
  }
  const present = (v: unknown) => v !== null && v !== undefined;

  function client() {
    return {
      from(table: string) {
        const filters: ((row: Row) => boolean)[] = [];
        const roleFilters: unknown[] = [];
        let embedRoles = false;
        let innerRoles = false;
        let limit = Number.POSITIVE_INFINITY;

        const rows = (): Row[] => {
          let out = (state.db[table] ?? []).map((r) => ({ ...r }));
          if (embedRoles) {
            out = out.map((r) => ({
              ...r,
              user_roles: (state.db["user_roles"] ?? [])
                .filter((ur) => ur["user_id"] === r["id"])
                .filter((ur) => roleFilters.every((role) => ur["role"] === role))
                .map((ur) => ({ role: ur["role"] })),
            }));
            if (innerRoles) out = out.filter((r) => (r["user_roles"] as unknown[]).length > 0);
          }
          return out.filter((r) => filters.every((f) => f(r))).slice(0, limit);
        };

        const builder = {
          select(columns: string) {
            embedRoles = columns.includes("user_roles");
            innerRoles = columns.includes("!inner");
            return builder;
          },
          eq(column: string, value: unknown) {
            if (column === "user_roles.role") roleFilters.push(value);
            else filters.push((r) => r[column] === value);
            return builder;
          },
          ilike(column: string, pattern: string) {
            state.ilikePatterns.push(pattern);
            const re = likeToRegExp(pattern);
            filters.push((r) => typeof r[column] === "string" && re.test(r[column] as string));
            return builder;
          },
          not(column: string, op: string, value: unknown) {
            if (op === "is" && value === null) filters.push((r) => present(r[column]));
            return builder;
          },
          or(expression: string) {
            state.orCalls.push(expression);
            const conditions = expression.split(",").map((part) => {
              const [column = "", op = "", ...rest] = part.split(".");
              return { column, op, value: rest.join(".") };
            });
            filters.push((r) =>
              conditions.some(({ column, op, value }) => {
                if (!present(r[column])) return false;
                if (op === "eq") return String(r[column]) === value;
                if (op === "neq") return String(r[column]) !== value;
                return false;
              }),
            );
            return builder;
          },
          limit(n: number) {
            limit = n;
            return builder;
          },
          async maybeSingle() {
            const rs = rows();
            return rs.length > 1
              ? { data: null, error: { code: "PGRST116", message: "multiple rows" } }
              : { data: rs[0] ?? null, error: null };
          },
          async single() {
            const rs = rows();
            return rs.length === 1
              ? { data: rs[0], error: null }
              : { data: null, error: { code: "PGRST116", message: "not exactly one row" } };
          },
          then(
            resolve: (value: { data: Row[]; error: null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            return Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    };
  }

  return { state, client };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client() }));

/** Two schools (A, B) with deliberately awkward identifiers. */
function world() {
  const student = (n: number, school: string, admissionNo: string, status = "active") => ({
    id: `st-${n}`,
    school_id: school,
    user_id: `u-student-${n}`,
    admission_no: admissionNo,
    status,
  });
  const teacher = (n: number, school: string, employeeNo: string, isActive = true) => ({
    id: `t-${n}`,
    school_id: school,
    user_id: `u-teacher-${n}`,
    employee_no: employeeNo,
    is_active: isActive,
  });
  const parent = (n: number, school: string, phone: string, isActive = true) => ({
    id: `p-${n}`,
    school_id: school,
    user_id: `u-parent-${n}`,
    phone,
    is_active: isActive,
  });
  const user = (id: string, email: string, phone: string | null = null, isActive = true) => ({
    id,
    email,
    phone,
    is_active: isActive,
  });

  return {
    students: [
      student(1, "sch-a", "S-2026-001"),
      student(2, "sch-a", "S-2026-002", "inactive"),
      student(3, "sch-a", "ADM_7"),
      student(4, "sch-a", "ADMX7"),
      student(5, "sch-a", "PCT%1"),
      student(6, "sch-a", "DUP-1"),
      student(7, "sch-b", "DUP-1"),
      student(8, "sch-a", "ONE-1"),
      student(9, "sch-b", "ONE-1", "inactive"),
      student(10, "sch-a", "STAR*1"),
      student(11, "sch-a", "STARX1"),
    ],
    teachers: [
      teacher(1, "sch-a", "T-1001"),
      teacher(2, "sch-a", "T-1002", false),
      teacher(3, "sch-a", "E-9"),
      teacher(4, "sch-b", "E-9"),
    ],
    parents: [
      parent(1, "sch-a", "9876543210"),
      parent(2, "sch-a", "9876543211", false),
      parent(3, "sch-a", "+91 98765 43299"),
      parent(4, "sch-a", "7000000000"),
      parent(5, "sch-b", "7000000000"),
      parent(6, "sch-b", "7111111111"),
      parent(7, "sch-a", ""),
    ],
    users: [
      ...[1, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => user(`u-student-${n}`, `student${n}@school.demo`)),
      user("u-student-2", "student2@school.demo", null, false),
      user("u-teacher-1", "teacher1@school.demo", "9000000001"),
      user("u-teacher-2", "teacher2@school.demo", null, false),
      user("u-teacher-3", "teacher3@school.demo"),
      user("u-teacher-4", "teacher4@school.demo"),
      user("u-parent-1", "parent1@school.demo", "9876543210"),
      user("u-parent-2", "parent2@school.demo", "9876543211", false),
      ...[3, 4, 6, 7].map((n) => user(`u-parent-${n}`, `parent${n}@school.demo`)),
      user("u-parent-5", "parent5@school.demo", "7000000000"),
      user("u-admin-1", "admin1@school.demo", "9000000002"),
      user("u-dual-1", "dual1@school.demo", "9000000003"),
      user("u-parent-only", "parentonly@school.demo", "9000000004"),
    ],
    user_roles: [
      { user_id: "u-teacher-1", role: "TEACHER" },
      { user_id: "u-parent-1", role: "PARENT" },
      { user_id: "u-parent-5", role: "PARENT" },
      { user_id: "u-admin-1", role: "SCHOOL_ADMIN" },
      { user_id: "u-dual-1", role: "TEACHER" },
      { user_id: "u-dual-1", role: "PARENT" },
      { user_id: "u-parent-only", role: "PARENT" },
    ],
  };
}

beforeEach(() => {
  fake.state.db = world();
  fake.state.orCalls = [];
  fake.state.ilikePatterns = [];
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

describe("existing identifier formats keep working", () => {
  it("matches a formatted phone exactly as typed", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "+91 98765 43299")).toEqual({
      email: "parent3@school.demo",
    });
  });

  it("matches the digits-only form of a formatted entry", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "98765-43210")).toEqual({
      email: "parent1@school.demo",
    });
  });

  it("falls back to the user profile phone for a PARENT-role login", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "9000000004")).toEqual({
      email: "parentonly@school.demo",
    });
  });

  it("resolves a user who is both teacher and parent through the parent fallback", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "9000000003")).toEqual({
      email: "dual1@school.demo",
    });
  });

  it("passes SCHOOL_ADMIN email through, lower-cased", async () => {
    expect(await resolveIdentifierToEmail("SCHOOL_ADMIN", "Principal@Example.Test")).toEqual({
      email: "principal@example.test",
    });
  });
});

describe("phone input is never spliced into a PostgREST filter", () => {
  it("does not let a crafted phone select another parent by id", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "0000000000,id.eq.p-6")).toBeNull();
  });

  it("does not let a crafted phone select an arbitrary user in the fallback", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "0,id.eq.u-teacher-1")).toBeNull();
  });

  it("does not match blank stored phones when the input has no digits", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "abc")).toBeNull();
  });

  it("never builds an or() filter from login input", async () => {
    for (const phone of ["9876543210", "98765-43210", "0000000000,id.eq.p-6", "9000000004"]) {
      await resolveIdentifierToEmail("PARENT", phone);
    }
    expect(fake.state.orCalls).toEqual([]);
  });
});

describe("LIKE wildcards in admission and employee numbers match literally", () => {
  it.each(["S-2026-%", "S-2026-00_", "S-2026-*", "%", "_", "*", "%1"])(
    "student identifier %s does not match other admission numbers",
    async (identifier) => {
      expect(await resolveIdentifierToEmail("STUDENT", identifier)).toBeNull();
    },
  );

  it.each(["T-100%", "T-100_", "T-*", "%"])(
    "teacher identifier %s does not match other employee numbers",
    async (identifier) => {
      expect(await resolveIdentifierToEmail("TEACHER", identifier)).toBeNull();
    },
  );

  it("treats _ in a real admission number as a literal underscore", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "adm_7")).toEqual({
      email: "student3@school.demo",
    });
    expect(await resolveIdentifierToEmail("STUDENT", "ADMX7")).toEqual({
      email: "student4@school.demo",
    });
  });

  it("treats * in a real admission number literally, despite PostgREST's * alias", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "star*1")).toEqual({
      email: "student10@school.demo",
    });
    expect(await resolveIdentifierToEmail("STUDENT", "STARX1")).toEqual({
      email: "student11@school.demo",
    });
  });

  it("treats % in a real admission number as a literal percent sign", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "pct%1")).toEqual({
      email: "student5@school.demo",
    });
  });

  it("escapes \\ % _ before mapping * to _, in the pattern sent to the database", async () => {
    await resolveIdentifierToEmail("STUDENT", "a\\b%c_d*e");
    await resolveIdentifierToEmail("TEACHER", "a\\b%c_d*e");
    expect(fake.state.ilikePatterns).toEqual(["a\\\\b\\%c\\_d_e", "a\\\\b\\%c\\_d_e"]);
  });

  it("treats \\ in a real admission number as a literal backslash", async () => {
    fake.state.db["students"]!.push(
      { id: "st-bs", school_id: "sch-a", user_id: "u-bs", admission_no: "BS\\1", status: "active" },
      { id: "st-bsx", school_id: "sch-a", user_id: "u-bsx", admission_no: "BSX1", status: "active" },
    );
    fake.state.db["users"]!.push(
      { id: "u-bs", email: "bs@school.demo", phone: null, is_active: true },
      { id: "u-bsx", email: "bsx@school.demo", phone: null, is_active: true },
    );
    expect(await resolveIdentifierToEmail("STUDENT", "bs\\1")).toEqual({ email: "bs@school.demo" });
  });

  it("fails closed when look-alikes fill the candidate limit and could hide a duplicate", async () => {
    // A literal "LIM*" in two schools, with 30 one-character variants between
    // them: a `*` lookup's candidate list is cut off after the first copy.
    const lookalikes = "0123456789ABCDEFGHIJKLMNOPQRST".split("").map((c) => `LIM${c}`);
    const ids = ["LIM*", ...lookalikes, "LIM*"];
    fake.state.db["students"]!.push(
      ...ids.map((admissionNo, i) => ({
        id: `st-lim-${i}`,
        school_id: i === ids.length - 1 ? "sch-b" : "sch-a",
        user_id: `u-lim-${i}`,
        admission_no: admissionNo,
        status: "active",
      })),
    );
    fake.state.db["users"]!.push(
      ...ids.map((_, i) => ({ id: `u-lim-${i}`, email: `lim${i}@school.demo`, phone: null, is_active: true })),
    );
    expect(await resolveIdentifierToEmail("STUDENT", "LIM*")).toBeNull();
  });
});

describe("identifiers repeated across schools fail closed", () => {
  it("does not resolve an admission number used by active students in two schools", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "DUP-1")).toBeNull();
  });

  it("does not resolve an employee number used by active teachers in two schools", async () => {
    expect(await resolveIdentifierToEmail("TEACHER", "E-9")).toBeNull();
  });

  it("does not resolve a phone shared by parents in two schools, even via the fallback", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "7000000000")).toBeNull();
  });

  it("still resolves when only one school's record is active", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "ONE-1")).toEqual({
      email: "student8@school.demo",
    });
  });
});

describe("parent phone login never resolves another role", () => {
  it("does not resolve a teacher's profile phone", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "9000000001")).toBeNull();
  });

  it("does not resolve a school admin's profile phone", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "9000000002")).toBeNull();
  });
});
