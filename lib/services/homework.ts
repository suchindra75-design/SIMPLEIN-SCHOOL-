import {
  authorizeRoles,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { getParentScope } from "@/lib/services/parents";
import { getTeacherScope } from "@/lib/services/teachers";
import {
  buildAttachmentPath,
  signedHomeworkUrl,
  uploadHomeworkAttachment,
  validateHomeworkUpload,
} from "@/lib/services/storage";
import type { HomeworkCreateInput, HomeworkUpdateInput } from "@/lib/validation/homework";

/**
 * Homework service (Phase 9). Reuses the existing scope/tenant/audit/Storage
 * abstractions. Teachers manage homework ONLY for their authorized sections
 * (existing teacher_can_access_section scope) and subjects (class teacher →
 * all subjects; subject assignee → their subject). Parents read their linked
 * children's sections only. Deletion is a soft-delete (history preserved).
 */

const HOMEWORK_COLUMNS =
  "id, school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date, is_active, created_at, subjects(name), sections(name), classes(name), teachers(display_name)";
const ATTACHMENT_COLUMNS =
  "id, school_id, homework_id, bucket, path, original_name, mime, bytes, uploaded_by, created_at";

export interface HomeworkFilters {
  sectionId?: string;
  subjectId?: string;
  dueBefore?: string;
  dueFrom?: string;
  includeInactive?: boolean;
  page: number;
  limit: number;
}

/* ------------------------------ scope helpers ---------------------------- */

/** Sections whose homework the caller may view (admin → all). */
export async function assertHomeworkSectionAccess(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (ctx.roles.includes("TEACHER")) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || !scope.sectionIds.has(sectionId)) {
      throw new TenantBoundaryError();
    }
    return;
  }
  if (ctx.roles.includes("PARENT")) {
    // Parent: at least one linked child must be in the section.
    const scope = await getParentScope(db, ctx);
    if (scope === null || scope.studentIds.size === 0) {
      throw new TenantBoundaryError();
    }
    const { data, error } = await db
      .from("students")
      .select("id, section_id")
      .in("id", [...scope.studentIds])
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(error);
    const inSection = (data as { section_id: string | null }[]).some(
      (s) => s.section_id === sectionId,
    );
    if (!inSection) throw new TenantBoundaryError();
    return;
  }
  if (ctx.roles.includes("STUDENT")) {
    // Student: own section only.
    const { getStudentScope } = await import("@/lib/services/students");
    const scope = await getStudentScope(db, ctx);
    if (scope === null || scope.sectionId !== sectionId) {
      throw new TenantBoundaryError();
    }
    return;
  }
  throw new TenantBoundaryError();
}

/**
 * Teacher may create homework for a section+subject iff they are the class
 * teacher of that section (all subjects) OR assigned to that subject in that
 * section. Admin passes.
 */
export async function teacherCanAssignSubject(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  subjectId: string,
): Promise<boolean> {
  if (isAdmin(ctx)) return true;
  if (!ctx.roles.includes("TEACHER")) return false;
  const scope = await getTeacherScope(db, ctx);
  if (scope === null || !scope.sectionIds.has(sectionId)) return false;
  const { data: section, error: secError } = await db
    .from("sections")
    .select("id, class_teacher_id")
    .eq("id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(secError);
  if ((section as { class_teacher_id: string | null }).class_teacher_id === scope.teacherId) {
    return true;
  }
  const { data: ts, error: tsError } = await db
    .from("teacher_subjects")
    .select("id")
    .eq("teacher_id", scope.teacherId)
    .eq("subject_id", subjectId)
    .eq("section_id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .maybeSingle();
  throwForPostgrest(tsError);
  return ts !== null;
}

/** Author-teacher check: the homework must belong to the caller's teacher. */
async function assertHomeworkAuthorship(
  db: DbClient,
  ctx: SessionContext,
  row: { teacher_id: string; section_id: string },
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (!ctx.roles.includes("TEACHER")) throw new TenantBoundaryError();
  const scope = await getTeacherScope(db, ctx);
  if (scope === null || scope.teacherId !== row.teacher_id) {
    throw new TenantBoundaryError();
  }
}

/* --------------------------------- reads --------------------------------- */

/** Auto-scoped homework list: admin → school; teacher → assigned sections; parent → children's sections. */
export async function listHomework(
  db: DbClient,
  ctx: SessionContext,
  f: HomeworkFilters,
): Promise<{ homework: HomeworkDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("homework")
    .select(
      `${HOMEWORK_COLUMNS}, homework_attachments(id, original_name, mime, bytes)`,
      { count: "exact" },
    )
    .eq("school_id", ctx.profile.schoolId)
    .order("due_date", { ascending: false })
    .range(from, from + f.limit - 1);

  if (!isAdmin(ctx)) {
    if (ctx.roles.includes("TEACHER")) {
      const scope = await getTeacherScope(db, ctx);
      if (scope === null || scope.sectionIds.size === 0) {
        return { homework: [], total: 0 };
      }
      if (f.sectionId !== undefined) {
        if (!scope.sectionIds.has(f.sectionId)) throw new TenantBoundaryError();
        query = query.eq("section_id", f.sectionId);
      } else {
        query = query.in("section_id", [...scope.sectionIds]);
      }
    } else if (ctx.roles.includes("STUDENT")) {
      // Student: own section's homework.
      const { getStudentScope } = await import("@/lib/services/students");
      const scope = await getStudentScope(db, ctx);
      if (scope === null || scope.sectionId === null) {
        return { homework: [], total: 0 };
      }
      query =
        f.sectionId !== undefined && f.sectionId === scope.sectionId
          ? query.eq("section_id", f.sectionId)
          : query.eq("section_id", scope.sectionId);
    } else {
      // Parent: linked children's sections only.
      const scope = await getParentScope(db, ctx);
      if (scope === null || scope.studentIds.size === 0) {
        return { homework: [], total: 0 };
      }
      const { data: students, error: studentError } = await db
        .from("students")
        .select("section_id")
        .in("id", [...scope.studentIds])
        .eq("school_id", ctx.profile.schoolId);
      throwForPostgrest(studentError);
      const sectionIds = [
        ...new Set(
          (students as { section_id: string | null }[])
            .map((s) => s.section_id)
            .filter((s): s is string => s !== null),
        ),
      ];
      if (sectionIds.length === 0) return { homework: [], total: 0 };
      query =
        f.sectionId !== undefined && sectionIds.includes(f.sectionId)
          ? query.eq("section_id", f.sectionId)
          : query.in("section_id", sectionIds);
    }
  } else if (f.sectionId !== undefined) {
    query = query.eq("section_id", f.sectionId);
  }

  if (f.subjectId !== undefined) query = query.eq("subject_id", f.subjectId);
  if (f.dueBefore !== undefined) query = query.lte("due_date", f.dueBefore);
  if (f.dueFrom !== undefined) query = query.gte("due_date", f.dueFrom);
  if (f.includeInactive !== true) query = query.eq("is_active", true);

  const { data, error, count } = await query;
  throwForPostgrest(error);
  return {
    homework: toCamel<HomeworkDto[]>(
      (data ?? []).map((h) => ({
        ...(h as Record<string, unknown>),
        attachments:
          (h as { homework_attachments?: unknown }).homework_attachments ?? [],
      })),
    ),
    total: count ?? 0,
  };
}

/** Scoped single read with attachments (404 unless authorized). */
export async function getHomework(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<{ homework: HomeworkDto; attachments: HomeworkAttachmentDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("homework")
    .select(HOMEWORK_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Homework not found");
  const row = data as unknown as {
    teacher_id: string;
    section_id: string;
    is_active: boolean;
  };
  await assertHomeworkSectionAccess(db, ctx, row.section_id);
  const { data: attachments, error: attError } = await db
    .from("homework_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("homework_id", id)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(attError);
  return {
    homework: toCamel<HomeworkDto>(data),
    attachments: toCamel<HomeworkAttachmentDto[]>(attachments ?? []),
  };
}

/* -------------------------------- mutations ------------------------------ */

/** Admin or authorized teacher (section + subject scoped). Audited. */
export async function createHomework(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  input: HomeworkCreateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  await assertHomeworkSectionAccess(db, ctx, sectionId);
  const canAssign = await teacherCanAssignSubject(db, ctx, sectionId, input.subjectId);
  if (!canAssign) {
    throw new TenantBoundaryError(
      "You are not authorized to assign homework for this subject",
    );
  }

  // Subject must exist in this school (404 on cross-tenant).
  const { data: subject, error: subjectError } = await db
    .from("subjects")
    .select("id")
    .eq("id", input.subjectId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(subjectError, "Subject not found in this school");

  // Academic year: the school's current year (consistent with other modules).
  const { data: year, error: yearError } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_current", true)
    .maybeSingle();
  throwForPostgrest(yearError);
  if (year === null) {
    throw new ConflictError("No academic year is configured for this school");
  }

  // Merged date-range validation (service-level; Zod re-checks at the API).
  const assignedOn = input.assignedOn ?? new Date().toISOString().slice(0, 10);
  if (input.dueDate < assignedOn) {
    throw new ConflictError("Due date must be on or after the assigned date");
  }

  // Teacher/creator: session teacher for teachers; resolve an admin's teacher
  // profile is NOT required — admins create on behalf of themselves? No:
  // teacher_id is the AUTHOR. For admins, use the section's class teacher if
  // set, else require an explicit teacher via… (kept simple: admins create
  // as themselves via their linked teacher profile; if none, conflict).
  let authorId: string;
  if (ctx.roles.includes("TEACHER")) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null) throw new TenantBoundaryError();
    authorId = scope.teacherId;
  } else {
    const { data: teacher, error: teacherError } = await db
      .from("teachers")
      .select("id")
      .eq("user_id", ctx.profile.id)
      .eq("school_id", ctx.profile.schoolId)
      .maybeSingle();
    throwForPostgrest(teacherError);
    if (teacher === null) {
      throw new ConflictError("Your login has no teacher profile linked");
    }
    authorId = (teacher as { id: string }).id;
  }

  const { data, error } = await db
    .from("homework")
    .insert({
      school_id: ctx.profile.schoolId,
      academic_year_id: (year as { id: string }).id,
      section_id: sectionId,
      subject_id: input.subjectId,
      teacher_id: authorId,
      title: input.title,
      description: input.description,
      assigned_on: input.assignedOn ?? new Date().toISOString().slice(0, 10),
      due_date: input.dueDate,
      is_active: true,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "homework.created", "homework", id, {
    sectionId,
    subjectId: input.subjectId,
    title: input.title,
  });
  return { id };
}

/** Author-teacher or admin. Audited. */
export async function updateHomework(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: HomeworkUpdateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const { data: existing, error: existError } = await db
    .from("homework")
    .select("id, teacher_id, section_id, assigned_on, due_date, is_active")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(existError, "Homework not found");
  const row = existing as unknown as {
    id: string;
    teacher_id: string;
    section_id: string;
    assigned_on: string;
    due_date: string;
    is_active: boolean;
  };
  await assertHomeworkSectionAccess(db, ctx, row.section_id);
  await assertHomeworkAuthorship(db, ctx, row);

  // Merged date-range validation (never fake defaults).
  const mergedAssigned = patch.assignedOn ?? row.assigned_on;
  const mergedDue = patch.dueDate ?? row.due_date;
  if (mergedDue < mergedAssigned) {
    throw new ConflictError("Due date must be on or after the assigned date");
  }

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update["title"] = patch.title;
  if (patch.description !== undefined) update["description"] = patch.description;
  if (patch.dueDate !== undefined) update["due_date"] = patch.dueDate;
  if (patch.assignedOn !== undefined) update["assigned_on"] = patch.assignedOn;
  if (Object.keys(update).length === 0) return { id };
  const { data, error } = await db
    .from("homework")
    .update(update)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Homework not found");
  await logAudit(db, ctx, "homework.updated", "homework", id, {
    fields: Object.keys(update),
  });
  return { id: (data as { id: string }).id };
}

/** Author-teacher or admin. SOFT-delete (history preserved, reversible). */
export async function deleteHomework(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const { data: existing, error: existError } = await db
    .from("homework")
    .select("id, teacher_id, section_id")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(existError, "Homework not found");
  const row = existing as unknown as {
    id: string;
    teacher_id: string;
    section_id: string;
  };
  await assertHomeworkSectionAccess(db, ctx, row.section_id);
  await assertHomeworkAuthorship(db, ctx, row);
  const { data, error } = await db
    .from("homework")
    .update({ is_active: false })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Homework not found");
  await logAudit(db, ctx, "homework.deleted", "homework", id, {});
  return { id: (data as { id: string }).id };
}

/* ------------------------------- attachments ----------------------------- */

/** Author-teacher or admin. Validates + uploads privately. Audited. */
export async function addHomeworkAttachment(
  db: DbClient,
  ctx: SessionContext,
  homeworkId: string,
  file: { name: string; type: string; size: number; bytes: ArrayBuffer },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const problem = validateHomeworkUpload(file);
  if (problem !== null) throw new ConflictError(problem);
  const { data: homework, error: hwError } = await db
    .from("homework")
    .select("id, teacher_id, section_id")
    .eq("id", homeworkId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(hwError, "Homework not found");
  const row = homework as unknown as {
    id: string;
    teacher_id: string;
    section_id: string;
  };
  await assertHomeworkSectionAccess(db, ctx, row.section_id);
  await assertHomeworkAuthorship(db, ctx, row);

  const path = buildAttachmentPath(ctx.profile.schoolId, "homework", homeworkId, file.name);
  await uploadHomeworkAttachment(db, path, file.bytes, file.type);
  const { data, error } = await db
    .from("homework_attachments")
    .insert({
      school_id: ctx.profile.schoolId,
      homework_id: homeworkId,
      bucket: "homework-attachments",
      path,
      original_name: file.name,
      mime: file.type,
      bytes: file.size,
      uploaded_by: ctx.profile.id,
    })
    .select("id")
    .single();
  if (error !== null || data === null) {
    // Best-effort cleanup: don't strand an orphan file.
    await db.storage.from("homework-attachments").remove([path]).catch(() => undefined);
    throw new Error(`attachment_save_failed: ${error?.message}`);
  }
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "homework.attachment_added", "homework_attachments", id, {
    homeworkId,
    name: file.name,
  });
  return { id };
}

/** Signed download URL; same scope as the homework read (parents included). */
export async function getHomeworkAttachmentUrl(
  db: DbClient,
  ctx: SessionContext,
  attachmentId: string,
): Promise<string> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("homework_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("id", attachmentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Attachment not found");
  const row = data as unknown as { homework_id: string; path: string };
  const { data: homework, error: hwError } = await db
    .from("homework")
    .select("id, section_id")
    .eq("id", row.homework_id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(hwError, "Homework not found");
  await assertHomeworkSectionAccess(
    db,
    ctx,
    (homework as { section_id: string }).section_id,
  );
  return signedHomeworkUrl(db, row.path);
}

/* --------------------------------- types --------------------------------- */

export interface HomeworkDto {
  id: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  description: string;
  assignedOn: string;
  dueDate: string;
  isActive: boolean;
  subjects?: { name: string } | null;
  sections?: { name: string } | null;
  classes?: { name: string } | null;
  teachers?: { displayName: string } | null;
  attachments?: HomeworkAttachmentDto[];
}

export interface HomeworkAttachmentDto {
  id: string;
  homeworkId: string;
  bucket: string;
  path: string;
  originalName: string;
  mime: string;
  bytes: number;
}
