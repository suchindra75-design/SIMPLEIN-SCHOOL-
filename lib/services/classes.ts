import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { assertCanWritePeople } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type { ClassDto, SectionDto } from "@/lib/services/dto";
import {
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";

/** Classes, sections, and class-teacher assignment. Catalog reads are open
 *  to all authenticated school members; writes are admin-only. */

export async function listClasses(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ classes: ClassDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("classes")
    .select("id, name, order_index, is_active, sections(id, name, order_index, is_active)")
    .eq("school_id", ctx.profile.schoolId)
    .order("order_index");
  throwForPostgrest(error);
  return { classes: toCamel<ClassDto[]>(data ?? []) };
}

export async function getClass(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<ClassDto> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("classes")
    .select(
      "id, name, order_index, is_active, sections(id, name, order_index, room, is_active, class_teacher_id, teachers(display_name))",
    )
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Class not found");
  return toCamel<ClassDto>(data);
}

export async function createClass(
  db: DbClient,
  ctx: SessionContext,
  input: { name: string; orderIndex: number },
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("classes")
    .insert({
      school_id: ctx.profile.schoolId,
      name: input.name,
      order_index: input.orderIndex,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "class.created", "classes", id, { name: input.name });
  return { id };
}

export async function updateClass(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: { name?: string; orderIndex?: number; isActive?: boolean },
) {
  assertCanWritePeople(ctx);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row["name"] = patch.name;
  if (patch.orderIndex !== undefined) row["order_index"] = patch.orderIndex;
  if (patch.isActive !== undefined) row["is_active"] = patch.isActive;
  const { data, error } = await db
    .from("classes")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Class not found");
  await logAudit(db, ctx, "class.updated", "classes", id, {
    fields: Object.keys(row),
  });
  return { id };
}

async function assertClassInSchool(
  db: DbClient,
  schoolId: string,
  classId: string,
): Promise<void> {
  const { data, error } = await db
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .single();
  if (error !== null || data === null) {
    throw new NotFoundError("Class not found in this school");
  }
}

export async function listSections(
  db: DbClient,
  ctx: SessionContext,
  classId: string,
): Promise<{ sections: SectionDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  await assertClassInSchool(db, ctx.profile.schoolId, classId);
  const { data, error } = await db
    .from("sections")
    .select("id, name, order_index, room, is_active, class_teacher_id, teachers(display_name)")
    .eq("class_id", classId)
    .eq("school_id", ctx.profile.schoolId)
    .order("order_index");
  throwForPostgrest(error);
  return { sections: toCamel<SectionDto[]>(data ?? []) };
}

export async function getSection(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<SectionDto> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("sections")
    .select(
      "id, class_id, name, order_index, room, is_active, class_teacher_id, classes(name), teachers(display_name)",
    )
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Section not found");
  return toCamel<SectionDto>(data);
}

export async function createSection(
  db: DbClient,
  ctx: SessionContext,
  classId: string,
  input: {
    name: string;
    orderIndex: number;
    classTeacherId?: string | null;
    room?: string | null;
  },
) {
  assertCanWritePeople(ctx);
  await assertClassInSchool(db, ctx.profile.schoolId, classId);
  if (input.classTeacherId !== undefined && input.classTeacherId !== null) {
    await assertTeacherInSchool(db, ctx.profile.schoolId, input.classTeacherId);
  }
  const { data, error } = await db
    .from("sections")
    .insert({
      school_id: ctx.profile.schoolId,
      class_id: classId,
      name: input.name,
      order_index: input.orderIndex,
      class_teacher_id: input.classTeacherId ?? null,
      room: input.room ?? null,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "section.created", "sections", id, {
    classId,
    name: input.name,
  });
  return { id };
}

export async function updateSection(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: {
    name?: string;
    orderIndex?: number;
    classTeacherId?: string | null;
    room?: string | null;
    isActive?: boolean;
  },
) {
  assertCanWritePeople(ctx);
  if (patch.classTeacherId !== undefined && patch.classTeacherId !== null) {
    await assertTeacherInSchool(db, ctx.profile.schoolId, patch.classTeacherId);
  }
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row["name"] = patch.name;
  if (patch.orderIndex !== undefined) row["order_index"] = patch.orderIndex;
  if (patch.classTeacherId !== undefined) row["class_teacher_id"] = patch.classTeacherId;
  if (patch.room !== undefined) row["room"] = patch.room;
  if (patch.isActive !== undefined) row["is_active"] = patch.isActive;
  const { data, error } = await db
    .from("sections")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Section not found");
  await logAudit(db, ctx, "section.updated", "sections", id, {
    fields: Object.keys(row),
  });
  return { id };
}

/** Shared tenant check: a teacher assigned anywhere must be in this school. */
export async function assertTeacherInSchool(
  db: DbClient,
  schoolId: string,
  teacherId: string,
): Promise<void> {
  const { data, error } = await db
    .from("teachers")
    .select("id")
    .eq("id", teacherId)
    .eq("school_id", schoolId)
    .single();
  if (error !== null || data === null) {
    throw new NotFoundError("Teacher not found in this school");
  }
}
