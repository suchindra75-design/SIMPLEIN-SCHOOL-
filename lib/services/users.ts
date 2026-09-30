import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type { UserDto } from "@/lib/services/dto";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import type {
  UserCreateInput,
  UserUpdateInput,
} from "@/lib/validation/people";
import type { AppRole } from "@/lib/auth/rbac";

/** Roles a School Admin may grant. SCHOOL_ADMIN is onboarding-only. */
const GRANTABLE: AppRole[] = ["TEACHER", "PARENT", "STUDENT"];

function requireAdmin(ctx: SessionContext): void {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
}

export interface UserFilters {
  role?: AppRole;
  isActive?: boolean;
  search?: string;
  page: number;
  limit: number;
}

/** Paginated users of the caller's school. Admin only. */
export async function listUsers(
  db: DbClient,
  ctx: SessionContext,
  f: UserFilters,
): Promise<{ users: UserDto[]; total: number }> {
  requireAdmin(ctx);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("users")
    .select("id, email, full_name, phone, is_active, created_at, user_roles!user_roles_user_id_fkey(role)", {
      count: "exact",
    })
    .eq("school_id", ctx.profile.schoolId)
    .order("full_name")
    .range(from, from + f.limit - 1);
  if (f.isActive !== undefined) query = query.eq("is_active", f.isActive);
  if (f.search !== undefined && f.search !== "") {
    const q = `%${f.search.replace(/[%_]/g, "")}%`;
    query = query.or(`full_name.ilike.${q},email.ilike.${q}`);
  }
  if (f.role !== undefined) {
    query = query.eq("user_roles!user_roles_user_id_fkey.role", f.role);
  }
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { users: toCamel<UserDto[]>(data ?? []), total: count ?? 0 };
}

/** Single user of the caller's school. Admin only. */
export async function getUser(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<UserDto> {
  requireAdmin(ctx);
  const { data, error } = await db
    .from("users")
    .select("id, email, full_name, phone, is_active, created_at, user_roles!user_roles_user_id_fkey(role)")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "User not found");
  return toCamel<UserDto>(data);
}

/**
 * Create a login identity + profile row + role grant, optionally linked to an
 * existing unlinked teacher/parent profile in the SAME school.
 * Identity writes use the isolated service-role client (see
 * docs/ARCHITECTURE.md §5.1); authorization comes from the admin ctx.
 * The password is never logged, returned, or stored outside Supabase Auth.
 */
export async function createUserWithRole(
  db: DbClient,
  ctx: SessionContext,
  input: UserCreateInput,
) {
  requireAdmin(ctx);
  const schoolId = ctx.profile.schoolId;
  const admin = createAdminClient();

  // Resolve + verify the profile link (same school, currently unlinked).
  const profileTable =
    input.role === "TEACHER"
      ? "teachers"
      : input.role === "PARENT"
        ? "parents"
        : "students";
  const profileId =
    input.role === "TEACHER"
      ? input.link.teacherId
      : input.role === "PARENT"
        ? input.link.parentId
        : input.link.studentId;
  if (profileId === undefined) {
    throw new ConflictError(`${input.role} creation requires a profile link`);
  }
  const { data: profile, error: profileError } = await admin
    .from(profileTable)
    .select("id, school_id, user_id")
    .eq("id", profileId)
    .single();
  if (profileError !== null || profile === null) {
    throw new NotFoundError("Linked profile not found in this school");
  }
  if ((profile as { school_id: string }).school_id !== schoolId) {
    throw new NotFoundError("Linked profile not found in this school");
  }
  if ((profile as { user_id: string | null }).user_id !== null) {
    throw new ConflictError("Profile is already linked to a login");
  }

  const { data: identity, error: identityError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
  if (identityError !== null || identity.user === null) {
    if (identityError?.message.toLowerCase().includes("already")) {
      throw new ConflictError("Email is already registered");
    }
    throw new Error(`Identity creation failed: ${identityError?.message}`);
  }

  try {
    const { data: user, error: userError } = await admin
      .from("users")
      .insert({
        auth_user_id: identity.user.id,
        school_id: schoolId,
        email: input.email,
        full_name: input.fullName,
        phone: input.phone ?? null,
        is_active: true,
      })
      .select("id")
      .single();
    if (userError !== null || user === null) {
      if (userError?.code === "23505") {
        throw new ConflictError("Email is already used in this school");
      }
      throw new Error(`Profile creation failed: ${userError?.message}`);
    }

    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: (user as { id: string }).id, role: input.role });
    if (roleError !== null) {
      throw new Error(`Role grant failed: ${roleError.message}`);
    }

    const { error: linkError } = await admin
      .from(profileTable)
      .update({ user_id: (user as { id: string }).id })
      .eq("id", profileId);
    if (linkError !== null) {
      throw new Error(`Profile link failed: ${linkError.message}`);
    }

    await logAudit(db, ctx, "user.created", "users", (user as { id: string }).id, {
      email: input.email,
      role: input.role,
      profileId,
    });
    return { userId: (user as { id: string }).id, email: input.email };
  } catch (error) {
    // Best-effort rollback: never strand a login without its school profile.
    await admin.auth.admin.deleteUser(identity.user.id).catch(() => undefined);
    throw error;
  }
}

/** Update contact fields of a same-school user. Admin only. */
export async function updateUser(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: UserUpdateInput,
) {
  requireAdmin(ctx);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .update({
      ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "User not found");
  await logAudit(db, ctx, "user.updated", "users", id, { fields: Object.keys(patch) });
  return toCamel(data);
}

/** Activate/deactivate. Admin only. Deactivation also bans the Auth identity
 *  (best-effort); the profile flag is authoritative and fails closed. */
export async function setUserActive(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  active: boolean,
) {
  requireAdmin(ctx);
  if (id === ctx.profile.id) {
    throw new ConflictError("You cannot deactivate your own account");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .update({ is_active: active })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id, auth_user_id")
    .single();
  throwForPostgrest(error, "User not found");
  const row = data as unknown as { id: string; auth_user_id: string };
  try {
    await admin.auth.admin.updateUserById(row.auth_user_id, {
      ban_duration: active ? "none" : "876000h",
    });
  } catch (authError) {
    console.error("[users] auth ban update failed", authError);
  }
  await logAudit(db, ctx, active ? "user.enabled" : "user.disabled", "users", id, {});
  return toCamel(row);
}

/** Grant an additional supported role. Never SCHOOL_ADMIN / STUDENT. */
export async function addUserRole(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  role: AppRole,
) {
  requireAdmin(ctx);
  if (!GRANTABLE.includes(role)) {
    throw new ConflictError(`Role ${role} cannot be granted by a School Admin`);
  }
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("users")
    .select("id")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (targetError !== null || target === null) {
    throw new NotFoundError("User not found");
  }
  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: id, role, granted_by: ctx.profile.id });
  if (error !== null) {
    if (error.code === "23505") throw new ConflictError("Role already granted");
    throw new Error(`Role grant failed: ${error.message}`);
  }
  await logAudit(db, ctx, "user.role_granted", "users", id, { role });
}
