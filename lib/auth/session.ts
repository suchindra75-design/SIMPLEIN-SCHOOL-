import {
  hasPermission,
  type Action,
  type AppRole,
  type Resource,
} from "@/lib/auth/rbac";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Tenant context — resolved server-side from the session, never from input. */
export interface TenantContext {
  userId: string;
  schoolId: string;
  roles: AppRole[];
  isActive: boolean;
}

/** Application profile row (public.users), camelCased for app code. */
export interface AppUser {
  id: string;
  authUserId: string;
  schoolId: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
}

/** Tenant row (public.schools), camelCased for app code. */
export interface School {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  logoPath: string | null;
  primaryColor: string | null;
  isActive: boolean;
}

/** Full resolved session: Supabase user → profile → school → roles. */
export interface SessionContext {
  authUserId: string;
  profile: AppUser;
  school: School;
  roles: AppRole[];
}

/** Raw DB shapes (snake_case) as returned by Supabase. */
export interface ProfileRow {
  id: string;
  auth_user_id: string;
  school_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

export interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  logo_path: string | null;
  primary_color: string | null;
  is_active: boolean;
}

export interface RoleRow {
  role: AppRole;
}

/* ------------------------------------------------------------------ */
/* Errors (mapped to the API envelope by lib/api/auth-errors.ts)       */
/* ------------------------------------------------------------------ */

export class AuthError extends Error {
  readonly code = "UNAUTHENTICATED";
  readonly status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Account exists but is disabled. Always fail closed. */
export class InactiveUserError extends ForbiddenError {
  constructor(message = "Account is disabled") {
    super(message);
    this.name = "InactiveUserError";
  }
}

/** Authenticated identity has no application profile (or no school). */
export class MissingProfileError extends ForbiddenError {
  constructor(message = "Account profile is not provisioned") {
    super(message);
    this.name = "MissingProfileError";
  }
}

/** Cross-tenant access attempt. Mapped to 404 to avoid existence oracle. */
export class TenantBoundaryError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "TenantBoundaryError";
  }
}

/* ------------------------------------------------------------------ */
/* Pure authorization core (no I/O — unit tested)                      */
/* ------------------------------------------------------------------ */

/** Assemble + validate a session from fetched rows. Fails closed. */
export function resolveSessionContext(
  authUserId: string,
  profile: ProfileRow | null,
  roleRows: RoleRow[],
  school: SchoolRow | null,
): SessionContext {
  if (profile === null || profile.auth_user_id !== authUserId) {
    throw new MissingProfileError();
  }
  if (!profile.is_active) {
    throw new InactiveUserError();
  }
  if (school === null || school.id !== profile.school_id || !school.is_active) {
    throw new MissingProfileError("School is unavailable");
  }
  const roles = roleRows.map((r) => r.role);
  return {
    authUserId,
    profile: {
      id: profile.id,
      authUserId: profile.auth_user_id,
      schoolId: profile.school_id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      isActive: profile.is_active,
    },
    school: {
      id: school.id,
      name: school.name,
      slug: school.slug,
      timezone: school.timezone,
      logoPath: school.logo_path,
      primaryColor: school.primary_color,
      isActive: school.is_active,
    },
    roles,
  };
}

/** Require one of the given roles. STUDENT has no grants, so a bare
 *  requireRole("STUDENT") still passes only if explicitly listed — callers
 *  must route students to the dormant page instead. */
export function authorizeRoles(
  ctx: SessionContext,
  allowed: readonly AppRole[],
): SessionContext {
  if (!ctx.roles.some((r) => allowed.includes(r))) {
    throw new ForbiddenError("Role is not authorized for this area");
  }
  return ctx;
}

/** Matrix check against lib/auth/rbac.ts (single source of truth). */
export function authorizePermission(
  ctx: SessionContext,
  resource: Resource,
  action: Action,
): SessionContext {
  if (!hasPermission(ctx.roles, resource, action)) {
    throw new ForbiddenError(`Missing ${action} permission on ${resource}`);
  }
  return ctx;
}

/** Tenant boundary: the accessed school must equal the session school. */
export function authorizeSchool(
  ctx: SessionContext,
  schoolId: string,
): SessionContext {
  if (schoolId !== ctx.profile.schoolId) {
    throw new TenantBoundaryError();
  }
  return ctx;
}

/** Role → dashboard home. STUDENT has no V1 dashboard (dormant). */
export function roleHome(roles: readonly AppRole[]): string {
  if (roles.includes("SCHOOL_ADMIN")) return "/admin";
  if (roles.includes("TEACHER")) return "/teacher";
  if (roles.includes("PARENT")) return "/parent";
  return "/student";
}

/* ------------------------------------------------------------------ */
/* Data-source boundary (injectable for tests)                         */
/* ------------------------------------------------------------------ */

/** Minimal surface the resolvers need. The production adapter uses the
 *  authenticated server client (RLS applies); tests inject fakes. */
export interface SessionDataClient {
  getAuthUserId(): Promise<string | null>;
  getProfile(authUserId: string): Promise<ProfileRow | null>;
  getRoles(userId: string): Promise<RoleRow[]>;
  getSchool(schoolId: string): Promise<SchoolRow | null>;
}

type SupabaseServerClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

function adaptSupabase(client: SupabaseServerClient): SessionDataClient {
  return {
    async getAuthUserId() {
      const { data, error } = await client.auth.getUser();
      if (error !== null || data.user === null) return null;
      return data.user.id;
    },
    async getProfile(authUserId: string) {
      const { data, error } = await client
        .from("users")
        .select(
          "id, auth_user_id, school_id, email, full_name, phone, is_active",
        )
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error !== null) throw error;
      return (data ?? null) as ProfileRow | null;
    },
    async getRoles(userId: string) {
      const { data, error } = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error !== null) throw error;
      return (data ?? []) as RoleRow[];
    },
    async getSchool(schoolId: string) {
      const { data, error } = await client
        .from("schools")
        .select("id, name, slug, timezone, logo_path, primary_color, is_active")
        .eq("id", schoolId)
        .maybeSingle();
      if (error !== null) throw error;
      return (data ?? null) as SchoolRow | null;
    },
  };
}

async function defaultClient(): Promise<SessionDataClient> {
  // No credentials (e.g. bare build/CI without Supabase): fail closed as
  // anonymous. Callers map this to login redirects / 401 — never access.
  if (!isSupabaseConfigured()) {
    return {
      getAuthUserId: async () => null,
      getProfile: async () => null,
      getRoles: async () => [],
      getSchool: async () => null,
    };
  }
  return adaptSupabase(await createServerSupabaseClient());
}

/* ------------------------------------------------------------------ */
/* Async resolvers / guards                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolve the full session, or null when there is no Supabase session.
 * Throws InactiveUserError / MissingProfileError for broken provisioning.
 * Never throws for anonymous callers — use requireAuth() to reject them.
 */
export async function getCurrentUser(
  client?: SessionDataClient,
): Promise<SessionContext | null> {
  const source = client ?? (await defaultClient());
  const authUserId = await source.getAuthUserId();
  if (authUserId === null) return null;
  const profile = await source.getProfile(authUserId);
  const roles =
    profile === null ? [] : await source.getRoles(profile.id);
  const school =
    profile === null ? null : await source.getSchool(profile.school_id);
  return resolveSessionContext(authUserId, profile, roles, school);
}

/** Current application profile, or null when unauthenticated. */
export async function getCurrentProfile(
  client?: SessionDataClient,
): Promise<AppUser | null> {
  const ctx = await getCurrentUser(client);
  return ctx === null ? null : ctx.profile;
}

/** Current school, or null when unauthenticated. */
export async function getCurrentSchool(
  client?: SessionDataClient,
): Promise<School | null> {
  const ctx = await getCurrentUser(client);
  return ctx === null ? null : ctx.school;
}

/** Reject anonymous callers. */
export async function requireAuth(
  client?: SessionDataClient,
): Promise<SessionContext> {
  const ctx = await getCurrentUser(client);
  if (ctx === null) throw new AuthError();
  return ctx;
}

/** Reject callers lacking one of the given roles. */
export async function requireRole(
  allowed: AppRole | readonly AppRole[],
  client?: SessionDataClient,
): Promise<SessionContext> {
  const ctx = await requireAuth(client);
  return authorizeRoles(ctx, Array.isArray(allowed) ? allowed : [allowed]);
}

/** Reject callers lacking the matrix permission. */
export async function requirePermission(
  resource: Resource,
  action: Action,
  client?: SessionDataClient,
): Promise<SessionContext> {
  const ctx = await requireAuth(client);
  return authorizePermission(ctx, resource, action);
}

/** Reject access to any school other than the session school (→ 404). */
export async function requireSchoolAccess(
  schoolId: string,
  client?: SessionDataClient,
): Promise<SessionContext> {
  const ctx = await requireAuth(client);
  return authorizeSchool(ctx, schoolId);
}

/**
 * Legacy tenant-context resolver. Preserved for existing callers
 * (lib/tenant.ts); now backed by the real Supabase session.
 */
export async function requireSession(
  client?: SessionDataClient,
): Promise<TenantContext> {
  const ctx = await requireAuth(client);
  return {
    userId: ctx.profile.id,
    schoolId: ctx.profile.schoolId,
    roles: ctx.roles,
    isActive: ctx.profile.isActive,
  };
}
