import {
  authorizeRoles,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import { assertCanWritePeople, isAdmin } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type { ChildDto, ParentDto } from "@/lib/services/dto";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import type { ParentCreateInput } from "@/lib/validation/people";
import type { StudentParentLinkInput } from "@/lib/validation/people";

const PARENT_COLUMNS =
  "id, school_id, user_id, full_name, phone, email, address, is_active, created_at";

export interface ParentFilters {
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

/** Parent directory. Admins and teachers (contact need); parents use scoped reads. */
export async function listParents(
  db: DbClient,
  ctx: SessionContext,
  f: ParentFilters,
): Promise<{ parents: ParentDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("parents")
    .select(PARENT_COLUMNS, { count: "exact" })
    .eq("school_id", ctx.profile.schoolId)
    .order("full_name")
    .range(from, from + f.limit - 1);
  if (f.isActive !== undefined) query = query.eq("is_active", f.isActive);
  if (f.search !== undefined && f.search !== "") {
    const q = `%${f.search.replace(/[%_]/g, "")}%`;
    query = query.or(`full_name.ilike.${q},phone.ilike.${q}`);
  }
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { parents: toCamel<ParentDto[]>(data ?? []), total: count ?? 0 };
}

/** Scoped read: admin/teacher directory; a parent reads only their own row. */
export async function getParent(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<ParentDto> {
  const { data, error } = await db
    .from("parents")
    .select(PARENT_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Parent not found");
  if (isAdmin(ctx) || ctx.roles.includes("TEACHER")) {
    return toCamel<ParentDto>(data);
  }
  const scope = await getParentScope(db, ctx);
  if (scope === null || scope.parentId !== id) {
    throw new TenantBoundaryError();
  }
  return toCamel<ParentDto>(data);
}

/** Admin only. */
export async function createParent(
  db: DbClient,
  ctx: SessionContext,
  input: ParentCreateInput,
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("parents")
    .insert({
      school_id: ctx.profile.schoolId,
      full_name: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "parent.created", "parents", id, {
    fullName: input.fullName,
  });
  return { id };
}

/** Admin only. */
export async function updateParent(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: Partial<ParentCreateInput> & { isActive?: boolean },
) {
  assertCanWritePeople(ctx);
  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row["full_name"] = patch.fullName;
  if (patch.phone !== undefined) row["phone"] = patch.phone;
  if (patch.email !== undefined) row["email"] = patch.email;
  if (patch.address !== undefined) row["address"] = patch.address;
  if (patch.isActive !== undefined) row["is_active"] = patch.isActive;
  const { data, error } = await db
    .from("parents")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Parent not found");
  await logAudit(db, ctx, "parent.updated", "parents", id, {
    fields: Object.keys(row),
  });
  return { id };
}

export interface ParentScope {
  parentId: string;
  studentIds: Set<string>;
}

/** Resolve the caller's parent scope (null when the user is not a parent). */
export async function getParentScope(
  db: DbClient,
  ctx: SessionContext,
): Promise<ParentScope | null> {
  const { data, error } = await db
    .from("parents")
    .select("id")
    .eq("user_id", ctx.profile.id)
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_active", true)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  if (data === null) return null;
  const parentId = (data as { id: string }).id;
  const { data: links, error: linkError } = await db
    .from("student_parents")
    .select("student_id")
    .eq("parent_id", parentId);
  throwForPostgrest(linkError);
  return {
    parentId,
    studentIds: new Set(
      (links as { student_id: string }[]).map((l) => l.student_id),
    ),
  };
}

/** Children of a parent. Admin or the parent themselves. */
export async function listChildren(
  db: DbClient,
  ctx: SessionContext,
  parentId: string,
): Promise<{ children: ChildDto[] }> {
  if (!isAdmin(ctx)) {
    const scope = await getParentScope(db, ctx);
    if (scope === null || scope.parentId !== parentId) {
      throw new TenantBoundaryError();
    }
  } else {
    await getParent(db, ctx, parentId);
  }
  const { data: links, error: linkError } = await db
    .from("student_parents")
    .select("student_id, relation, is_primary")
    .eq("parent_id", parentId);
  throwForPostgrest(linkError);
  const rows = links as { student_id: string; relation: string; is_primary: boolean }[];
  if (rows.length === 0) return { children: [] };
  const { data: students, error: studentError } = await db
    .from("students")
    .select(
      "id, admission_no, display_name, class_id, section_id, roll_number, status, classes(name), sections(name)",
    )
    .in(
      "id",
      rows.map((r) => r.student_id),
    )
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(studentError);
  const byId = new Map(
    (students as { id: string }[]).map((s) => [s.id, s]),
  );
  return {
    children: toCamel<ChildDto[]>(
      rows
        .map((l) => ({ ...(byId.get(l.student_id) ?? {}), link: l }))
        .filter((c) => (c as Record<string, unknown>)["id"] !== undefined),
    ),
  };
}

/** Admin only. Both sides must already live in this school (DB trigger backstops). */
export async function linkChild(
  db: DbClient,
  ctx: SessionContext,
  parentId: string,
  studentId: string,
  input: StudentParentLinkInput,
) {
  assertCanWritePeople(ctx);
  await getParent(db, ctx, parentId);
  const { data, error } = await db
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (error !== null || data === null) {
    throw new NotFoundError("Student not found in this school");
  }
  const { error: linkError } = await db.from("student_parents").insert({
    student_id: studentId,
    parent_id: parentId,
    relation: input.relation,
    is_primary: input.isPrimary,
  });
  if (linkError !== null) {
    if (linkError.code === "23505") {
      throw new ConflictError("Parent is already linked to this student");
    }
    throw new Error(`Link failed: ${linkError.message}`);
  }
  await logAudit(db, ctx, "student.linked", "student_parents", null, {
    studentId,
    parentId,
    relation: input.relation,
  });
  return { studentId, parentId };
}

/** Admin only. History is preserved in the audit log. */
export async function unlinkChild(
  db: DbClient,
  ctx: SessionContext,
  parentId: string,
  studentId: string,
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("student_parents")
    .delete()
    .eq("parent_id", parentId)
    .eq("student_id", studentId)
    .select("student_id")
    .single();
  throwForPostgrest(error, "Link not found");
  await logAudit(db, ctx, "student.unlinked", "student_parents", null, {
    studentId,
    parentId,
  });
  return { studentId: (data as { student_id: string }).student_id };
}
