import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { assertCanWritePeople } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type { ClassSubjectDto, SubjectDto } from "@/lib/services/dto";
import {
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";

/** Subjects catalogue + class↔subject links. Reads open to members. */

export async function listSubjects(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ subjects: SubjectDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { data, error } = await db
    .from("subjects")
    .select("id, name, code, order_index, is_active")
    .eq("school_id", ctx.profile.schoolId)
    .order("order_index");
  throwForPostgrest(error);
  return { subjects: toCamel<SubjectDto[]>(data ?? []) };
}

export async function createSubject(
  db: DbClient,
  ctx: SessionContext,
  input: { name: string; code?: string | null; orderIndex: number },
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("subjects")
    .insert({
      school_id: ctx.profile.schoolId,
      name: input.name,
      code: input.code ?? null,
      order_index: input.orderIndex,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "subject.created", "subjects", id, { name: input.name });
  return { id };
}

export async function updateSubject(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: { name?: string; code?: string | null; orderIndex?: number; isActive?: boolean },
) {
  assertCanWritePeople(ctx);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row["name"] = patch.name;
  if (patch.code !== undefined) row["code"] = patch.code;
  if (patch.orderIndex !== undefined) row["order_index"] = patch.orderIndex;
  if (patch.isActive !== undefined) row["is_active"] = patch.isActive;
  const { data, error } = await db
    .from("subjects")
    .update(row)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Subject not found");
  await logAudit(db, ctx, "subject.updated", "subjects", id, {
    fields: Object.keys(row),
  });
  return { id };
}

/** Subjects linked to a class (drives future exam/timetable/marks scoping). */
export async function listClassSubjects(
  db: DbClient,
  ctx: SessionContext,
  classId: string,
): Promise<{ classSubjects: ClassSubjectDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data: cls, error: clsError } = await db
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (clsError !== null || cls === null) {
    throw new NotFoundError("Class not found in this school");
  }
  const { data, error } = await db
    .from("class_subjects")
    .select("id, subject_id, subjects(id, name, code, is_active)")
    .eq("class_id", classId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  return { classSubjects: toCamel<ClassSubjectDto[]>(data ?? []) };
}

/** Admin only. */
export async function linkSubjectToClass(
  db: DbClient,
  ctx: SessionContext,
  classId: string,
  subjectId: string,
) {
  assertCanWritePeople(ctx);
  for (const [table, id] of [
    ["classes", classId],
    ["subjects", subjectId],
  ] as const) {
    const { data, error } = await db
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError(`${table.slice(0, -1)} not found in this school`);
    }
  }
  const { data, error } = await db
    .from("class_subjects")
    .insert({
      school_id: ctx.profile.schoolId,
      class_id: classId,
      subject_id: subjectId,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "class.subject_linked", "class_subjects", id, {
    classId,
    subjectId,
  });
  return { id };
}

/** Admin only. */
export async function unlinkSubjectFromClass(
  db: DbClient,
  ctx: SessionContext,
  classId: string,
  subjectId: string,
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("class_subjects")
    .delete()
    .eq("class_id", classId)
    .eq("subject_id", subjectId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Link not found");
  await logAudit(db, ctx, "class.subject_unlinked", "class_subjects", null, {
    classId,
    subjectId,
  });
  return { id: (data as { id: string }).id };
}
