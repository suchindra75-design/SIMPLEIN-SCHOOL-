import { describe, expect, it } from "vitest";
import {
  AuthError,
  authorizePermission,
  authorizeRoles,
  authorizeSchool,
  ForbiddenError,
  getCurrentUser,
  InactiveUserError,
  MissingProfileError,
  requireAuth,
  requirePermission,
  requireRole,
  requireSchoolAccess,
  resolveSessionContext,
  roleHome,
  TenantBoundaryError,
  type ProfileRow,
  type RoleRow,
  type SchoolRow,
  type SessionDataClient,
} from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/rbac";

/* ------------------------------------------------------------------ */
/* Fakes: authorization is tested at the server boundary (SessionData-  */
/* Client injection), not via frontend redirects. RLS equivalents run  */
/* against live Postgres via supabase/tests/phase2_rls.sql.            */
/* ------------------------------------------------------------------ */

const SCHOOL_A = "11111111-1111-4111-8111-111111111111";
const SCHOOL_B = "22222222-2222-4222-8222-222222222222";

function profileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    auth_user_id: "auth-1",
    school_id: SCHOOL_A,
    email: "admin@schoola.example",
    full_name: "Asha Admin",
    phone: null,
    is_active: true,
    ...overrides,
  };
}

function schoolRow(overrides: Partial<SchoolRow> = {}): SchoolRow {
  return {
    id: SCHOOL_A,
    name: "School A",
    slug: "school-a",
    timezone: "Asia/Kolkata",
    logo_path: null,
    primary_color: null,
    is_active: true,
    ...overrides,
  };
}

function roleRows(roles: AppRole[]): RoleRow[] {
  return roles.map((role) => ({ role }));
}

function fakeClient(opts: {
  authUserId?: string | null;
  profile?: ProfileRow | null;
  roles?: AppRole[];
  school?: SchoolRow | null;
} = {}): SessionDataClient {
  const {
    authUserId = "auth-1",
    profile = profileRow(),
    roles = [],
    school = schoolRow(),
  } = opts;
  return {
    getAuthUserId: async () => authUserId,
    getProfile: async () => profile,
    getRoles: async () => roleRows(roles),
    getSchool: async () => school,
  };
}

describe("resolveSessionContext", () => {
  it("resolves an active provisioned user", () => {
    const ctx = resolveSessionContext(
      "auth-1",
      profileRow(),
      roleRows(["SCHOOL_ADMIN"]),
      schoolRow(),
    );
    expect(ctx.profile.schoolId).toBe(SCHOOL_A);
    expect(ctx.roles).toEqual(["SCHOOL_ADMIN"]);
  });

  it("rejects missing profile and auth-id mismatch", () => {
    const school = schoolRow();
    expect(() => resolveSessionContext("auth-1", null, [], school)).toThrow(
      MissingProfileError,
    );
    expect(() =>
      resolveSessionContext("auth-other", profileRow(), [], school),
    ).toThrow(MissingProfileError);
  });

  it("rejects inactive users (fail closed)", () => {
    expect(() =>
      resolveSessionContext(
        "auth-1",
        profileRow({ is_active: false }),
        roleRows(["SCHOOL_ADMIN"]),
        schoolRow(),
      ),
    ).toThrow(InactiveUserError);
  });

  it("rejects missing, mismatched, or inactive school", () => {
    const profile = profileRow();
    expect(() => resolveSessionContext("auth-1", profile, [], null)).toThrow(
      MissingProfileError,
    );
    expect(() =>
      resolveSessionContext("auth-1", profile, [], schoolRow({ id: SCHOOL_B })),
    ).toThrow(MissingProfileError);
    expect(() =>
      resolveSessionContext(
        "auth-1",
        profile,
        [],
        schoolRow({ is_active: false }),
      ),
    ).toThrow(MissingProfileError);
  });
});

describe("authentication boundary", () => {
  it("unauthenticated request resolves to null / rejected by requireAuth", async () => {
    await expect(
      getCurrentUser(fakeClient({ authUserId: null })),
    ).resolves.toBeNull();
    await expect(
      requireAuth(fakeClient({ authUserId: null })),
    ).rejects.toThrow(AuthError);
  });

  it("authenticated request with profile is accepted", async () => {
    const ctx = await getCurrentUser(fakeClient({ roles: ["SCHOOL_ADMIN"] }));
    expect(ctx?.profile.email).toBe("admin@schoola.example");
  });

  it("inactive user cannot access protected functionality", async () => {
    const client = fakeClient({
      profile: profileRow({ is_active: false }),
      roles: ["SCHOOL_ADMIN"],
    });
    await expect(getCurrentUser(client)).rejects.toThrow(InactiveUserError);
    await expect(requireAuth(client)).rejects.toThrow(InactiveUserError);
  });
});

describe("RBAC at the server boundary", () => {
  it("admin is allowed where appropriate", async () => {
    const client = fakeClient({ roles: ["SCHOOL_ADMIN"] });
    await expect(requireRole("SCHOOL_ADMIN", client)).resolves.toBeDefined();
    await expect(
      requirePermission("users", "manage", client),
    ).resolves.toBeDefined();
  });

  it("teacher is denied from admin-only areas", async () => {
    const client = fakeClient({ roles: ["TEACHER"] });
    await expect(requireRole("SCHOOL_ADMIN", client)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      requirePermission("users", "manage", client),
    ).rejects.toThrow(ForbiddenError);
    // …but keeps legitimate module access (link-scoping enforced per-request later)
    await expect(
      requirePermission("attendance", "write", client),
    ).resolves.toBeDefined();
  });

  it("parent is denied from admin/teacher areas", async () => {
    const client = fakeClient({ roles: ["PARENT"] });
    await expect(requireRole("SCHOOL_ADMIN", client)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(requireRole("TEACHER", client)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      requirePermission("marks", "write", client),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requirePermission("marks", "read", client),
    ).resolves.toBeDefined();
  });

  it("STUDENT is activated (Phase 12): self-only reads, no writes, no admin", () => {
    const ctx = resolveSessionContext(
      "auth-1",
      profileRow(),
      roleRows(["STUDENT"]),
      schoolRow(),
    );
    // Self-only reads are granted (scoped per-request to own data).
    expect(authorizePermission(ctx, "notices", "read")).toBeDefined();
    expect(authorizePermission(ctx, "timetable", "read")).toBeDefined();
    expect(authorizePermission(ctx, "marks", "read")).toBeDefined();
    // No writes anywhere; no admin areas.
    expect(() => authorizePermission(ctx, "notices", "write")).toThrow(
      ForbiddenError,
    );
    expect(() => authorizePermission(ctx, "marks", "write")).toThrow(
      ForbiddenError,
    );
    expect(() => authorizeRoles(ctx, ["SCHOOL_ADMIN"])).toThrow(
      ForbiddenError,
    );
  });
});

describe("tenant isolation (explicit matrix)", () => {
  const cases: { role: AppRole; label: string }[] = [
    { role: "SCHOOL_ADMIN", label: "School A Admin" },
    { role: "TEACHER", label: "School A Teacher" },
    { role: "PARENT", label: "School A Parent" },
  ];

  for (const { role, label } of cases) {
    it(`${label} → School A data → ALLOWED`, async () => {
      const client = fakeClient({ roles: [role] });
      await expect(
        requireSchoolAccess(SCHOOL_A, client),
      ).resolves.toBeDefined();
    });

    it(`${label} → School B data → DENIED (404, no existence leak)`, async () => {
      const client = fakeClient({ roles: [role] });
      await expect(requireSchoolAccess(SCHOOL_B, client)).rejects.toThrow(
        TenantBoundaryError,
      );
    });
  }

  it("pure authorizeSchool allows same school and denies cross-school", () => {
    const ctx = resolveSessionContext(
      "auth-1",
      profileRow(),
      roleRows(["SCHOOL_ADMIN"]),
      schoolRow(),
    );
    expect(() => authorizeSchool(ctx, SCHOOL_A)).not.toThrow();
    expect(() => authorizeSchool(ctx, SCHOOL_B)).toThrow(TenantBoundaryError);
  });
});

describe("role routing", () => {
  it("maps roles to dashboards; students get the dormant page", () => {
    expect(roleHome(["SCHOOL_ADMIN"])).toBe("/admin");
    expect(roleHome(["TEACHER"])).toBe("/teacher");
    expect(roleHome(["PARENT"])).toBe("/parent");
    expect(roleHome(["STUDENT"])).toBe("/student");
    expect(roleHome([])).toBe("/student");
  });
});
