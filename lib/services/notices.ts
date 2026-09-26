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
import {
  fanOutNotification,
  type Audience,
} from "@/lib/services/notifications";
import {
  buildAttachmentPath,
  signedBucketUrl,
  uploadToBucket,
  validateDocumentUpload,
} from "@/lib/services/storage";

/**
 * Notices service (Phase 10). Audience targeting is SERVER-SIDE: feeds and
 * detail access filter by notice_targets (school-wide + caller-relevant),
 * mirroring the RLS audience joins. Attachments: single per notice, private
 * `notice-attachments` bucket, signed URLs only. Publish triggers the
 * notification fan-out. Deletion is a soft-delete (history preserved).
 * Teachers have read-only notice permissions in the matrix — creation is
 * admin-only (deny-by-default; a teacher-creation policy flag is future work).
 */

const NOTICE_COLUMNS =
  "id, school_id, title, content, category, is_published, published_at, expires_at, is_active, attachment_bucket, attachment_path, attachment_name, attachment_mime, attachment_bytes, created_by, created_at";

export interface NoticeFilters {
  category?: string;
  includeInactive?: boolean;
  page: number;
  limit: number;
}

/* ------------------------------ audience logic --------------------------- */

/** Audience relevance for the caller (mirrors the RLS joins; server-side). */
async function audienceRelevant(
  db: DbClient,
  ctx: SessionContext,
  noticeId: string,
): Promise<boolean> {
  if (isAdmin(ctx)) return true;
  // Untargeted notice = school-wide → every member.
  const { data: targets, error: targetError } = await db
    .from("notice_targets")
    .select("id, audience_type, class_id, section_id")
    .eq("notice_id", noticeId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(targetError);
  const rows = targets as {
    audience_type: string;
    class_id: string | null;
    section_id: string | null;
  }[];
  if (rows.length === 0) return true;

  if (ctx.roles.includes("TEACHER")) {
    return teacherRelevant(db, ctx, rows);
  }
  if (ctx.roles.includes("PARENT")) {
    const scope = await parentScope(db, ctx);
    return rows.some((t) => {
      if (t.audience_type === "PARENTS") return true;
      if (t.audience_type === "SECTION" && t.section_id !== null) {
        return scope.childSectionIds.has(t.section_id);
      }
      if (t.audience_type === "CLASS" && t.class_id !== null) {
        return scope.childClassIds.has(t.class_id);
      }
      return false;
    });
  }
  return false;
}

async function parentScope(db: DbClient, ctx: SessionContext): Promise<{
  childSectionIds: Set<string>;
  childClassIds: Set<string>;
}> {
  const { data: parent, error: parentError } = await db
    .from("parents")
    .select("id")
    .eq("user_id", ctx.profile.id)
    .eq("school_id", ctx.profile.schoolId)
    .maybeSingle();
  throwForPostgrest(parentError);
  if (parent === null) {
    return { childSectionIds: new Set(), childClassIds: new Set() };
  }
  const parentId = (parent as { id: string }).id;
  const { data: links, error: linkError } = await db
    .from("student_parents")
    .select("student_id")
    .eq("parent_id", parentId);
  throwForPostgrest(linkError);
  const studentIds = (links as { student_id: string }[]).map((l) => l.student_id);
  const childSectionIds = new Set<string>();
  const childClassIds = new Set<string>();
  if (studentIds.length > 0) {
    const { data: students, error: studentError } = await db
      .from("students")
      .select("id, section_id, class_id")
      .in("id", studentIds)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(studentError);
    for (const s of students as { section_id: string | null; class_id: string | null }[]) {
      if (s.section_id !== null) childSectionIds.add(s.section_id);
      if (s.class_id !== null) childClassIds.add(s.class_id);
    }
  }
  return { childSectionIds, childClassIds };
}

async function teacherRelevant(
  db: DbClient,
  ctx: SessionContext,
  targets: { audience_type: string; class_id: string | null; section_id: string | null }[],
): Promise<boolean> {
  const { data: teacher, error: teacherError } = await db
    .from("teachers")
    .select("id")
    .eq("user_id", ctx.profile.id)
    .eq("school_id", ctx.profile.schoolId)
    .maybeSingle();
  throwForPostgrest(teacherError);
  const teacherId = (teacher as { id: string } | null)?.id;
  if (teacherId === undefined || teacherId === null) return false;
  for (const t of targets) {
    if (t.audience_type === "TEACHERS") return true;
    if (t.audience_type === "SECTION" && t.section_id !== null) {
      const { data: sec, error: secError } = await db
        .from("sections")
        .select("id")
        .eq("id", t.section_id)
        .eq("class_teacher_id", teacherId)
        .eq("school_id", ctx.profile.schoolId)
        .maybeSingle();
      throwForPostgrest(secError);
      if (sec !== null) return true;
      const { data: ts, error: tsError } = await db
        .from("teacher_subjects")
        .select("id")
        .eq("section_id", t.section_id)
        .eq("teacher_id", teacherId)
        .eq("school_id", ctx.profile.schoolId)
        .maybeSingle();
      throwForPostgrest(tsError);
      if (ts !== null) return true;
    }
    if (t.audience_type === "CLASS" && t.class_id !== null) {
      const { data: sec, error: secError } = await db
        .from("sections")
        .select("id")
        .eq("class_id", t.class_id)
        .eq("school_id", ctx.profile.schoolId)
        .or(`class_teacher_id.eq.${teacherId}`);
      throwForPostgrest(secError);
      const rows = (sec as unknown as { id: string }[] | null) ?? [];
      if (rows.length > 0) return true;
    }
  }
  return false;
}

/* --------------------------------- reads --------------------------------- */

/** Audience-filtered notice feed (expired notices excluded). */
export async function listNotices(
  db: DbClient,
  ctx: SessionContext,
  f: NoticeFilters,
): Promise<{ notices: NoticeDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("notices")
    .select(NOTICE_COLUMNS, { count: "exact" })
    .eq("school_id", ctx.profile.schoolId)
    .order("created_at", { ascending: false })
    .range(from, from + f.limit - 1);
  if (f.includeInactive !== true) {
    query = query.eq("is_active", true).eq("is_published", true);
  }
  if (f.category !== undefined) query = query.eq("category", f.category);
  const { data, error, count } = await query;
  throwForPostgrest(error);
  const all = toCamel<NoticeDto[]>(data ?? []);

  // Expired notices are excluded from feeds for EVERY role (server-side).
  const today = new Date().toISOString().slice(0, 10);
  const notExpired = all.filter(
    (n) => n.expiresAt === null || n.expiresAt >= today,
  );
  if (isAdmin(ctx)) return { notices: notExpired, total: notExpired.length };

  // Audience filter (server-side, mirrors RLS).
  const visible: NoticeDto[] = [];
  for (const n of notExpired) {
    if (await audienceRelevant(db, ctx, n.id)) visible.push(n);
  }
  return { notices: visible, total: visible.length };
}

/** In-audience single read (404 outside audience / cross-tenant). */
export async function getNotice(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<NoticeDto> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("notices")
    .select(NOTICE_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Notice not found");
  const notice = toCamel<NoticeDto>(data);
  if (!isAdmin(ctx)) {
    const relevant = await audienceRelevant(db, ctx, id);
    if (!relevant) throw new TenantBoundaryError();
  }
  return notice;
}

/* -------------------------------- mutations ------------------------------ */

/** Admin only, audited. Creates the notice + target (deduped). */
export async function createNotice(
  db: DbClient,
  ctx: SessionContext,
  input: {
    title: string;
    content: string;
    category: string;
    audience: Audience;
    expiresAt?: string | null;
  },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  // CLASS/SECTION targets must reference this school (404 on cross-tenant).
  if (input.audience.type === "CLASS" && input.audience.classId !== undefined) {
    const { data, error } = await db
      .from("classes")
      .select("id")
      .eq("id", input.audience.classId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError("Class not found in this school");
    }
  }
  if (input.audience.type === "SECTION" && input.audience.sectionId !== undefined) {
    const { data, error } = await db
      .from("sections")
      .select("id")
      .eq("id", input.audience.sectionId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError("Section not found in this school");
    }
  }
  const { data, error } = await db
    .from("notices")
    .insert({
      school_id: ctx.profile.schoolId,
      title: input.title,
      content: input.content,
      category: input.category,
      is_published: false,
      expires_at: input.expiresAt ?? null,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await db.from("notice_targets").insert({
    school_id: ctx.profile.schoolId,
    notice_id: id,
    audience_type: input.audience.type,
    class_id: input.audience.classId ?? null,
    section_id: input.audience.sectionId ?? null,
  });
  await logAudit(db, ctx, "notice.created", "notices", id, {
    title: input.title,
    audience: input.audience.type,
  });
  return { id };
}

/** Admin only, audited. */
export async function updateNotice(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: {
    title?: string;
    content?: string;
    category?: string;
    expiresAt?: string | null;
    audience?: Audience;
  },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row["title"] = patch.title;
  if (patch.content !== undefined) row["content"] = patch.content;
  if (patch.category !== undefined) row["category"] = patch.category;
  if (patch.expiresAt !== undefined) row["expires_at"] = patch.expiresAt;
  if (Object.keys(row).length > 0) {
    const { data, error } = await db
      .from("notices")
      .update(row)
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId)
      .select("id")
      .single();
    throwForPostgrest(error, "Notice not found");
    void data;
  }
  if (patch.audience !== undefined) {
    // Replace the target (audited as an important target change).
    const { error: delError } = await db
      .from("notice_targets")
      .delete()
      .eq("notice_id", id)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(delError);
    const { error: insError } = await db.from("notice_targets").insert({
      school_id: ctx.profile.schoolId,
      notice_id: id,
      audience_type: patch.audience.type,
      class_id: patch.audience.classId ?? null,
      section_id: patch.audience.sectionId ?? null,
    });
    throwForPostgrest(insError);
  }
  await logAudit(db, ctx, "notice.updated", "notices", id, {
    fields: Object.keys(row).concat(patch.audience !== undefined ? ["audience"] : []),
  });
  return { id };
}

/** Admin only, audited. Publishing fans out notifications (server-side). */
export async function setNoticePublished(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  published: boolean,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("notices")
    .update({
      is_published: published,
      ...(published ? { published_at: new Date().toISOString() } : {}),
    })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id, title, content")
    .single();
  throwForPostgrest(error, "Notice not found");
  const row = data as { id: string; title: string; content: string };
  let recipients = 0;
  if (published) {
    const { data: targets, error: targetError } = await db
      .from("notice_targets")
      .select("audience_type, class_id, section_id")
      .eq("notice_id", id)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(targetError);
    const t = (targets as { audience_type: string; class_id: string | null; section_id: string | null }[])[0];
    const audience: Audience = {
      type: (t?.audience_type as Audience["type"]) ?? "SCHOOL",
      classId: t?.class_id ?? null,
      sectionId: t?.section_id ?? null,
    };
    const fan = await fanOutNotification(db, ctx, {
      type: "NOTICE",
      title: `New notice: ${row.title}`,
      message: row.content.slice(0, 300),
      entity: "notices",
      entityId: id,
      audience,
    });
    recipients = fan.recipients;
  }
  await logAudit(db, ctx, published ? "notice.published" : "notice.unpublished", "notices", id, {
    recipients,
  });
  return { id: (row as { id: string }).id };
}

/** Admin only, audited. SOFT-delete (archive — history preserved). */
export async function deleteNotice(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("notices")
    .update({ is_active: false, is_published: false })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Notice not found");
  await logAudit(db, ctx, "notice.deleted", "notices", id, {});
  return { id: (data as { id: string }).id };
}

/* ------------------------------- attachment ------------------------------ */

/** Admin only. Sets the single attachment (validated, stored privately). */
export async function setNoticeAttachment(
  db: DbClient,
  ctx: SessionContext,
  noticeId: string,
  file: { name: string; type: string; size: number; bytes: ArrayBuffer },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const problem = validateDocumentUpload(file);
  if (problem !== null) throw new ConflictError(problem);
  const { data: notice, error: noticeError } = await db
    .from("notices")
    .select("id")
    .eq("id", noticeId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(noticeError, "Notice not found");
  void notice;
  const path = buildAttachmentPath(ctx.profile.schoolId, "notices", noticeId, file.name);
  await uploadToBucket(db, "notice-attachments", path, file.bytes, file.type);
  const { data, error } = await db
    .from("notices")
    .update({
      attachment_bucket: "notice-attachments",
      attachment_path: path,
      attachment_name: file.name,
      attachment_mime: file.type,
      attachment_bytes: file.size,
    })
    .eq("id", noticeId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Notice not found");
  await logAudit(db, ctx, "notice.attachment_set", "notices", noticeId, {
    name: file.name,
  });
  return { id: (data as { id: string }).id };
}

/** Signed attachment URL; same audience scope as the notice read. */
export async function getNoticeAttachmentUrl(
  db: DbClient,
  ctx: SessionContext,
  noticeId: string,
): Promise<string> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("notices")
    .select(NOTICE_COLUMNS)
    .eq("id", noticeId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Notice not found");
  const notice = toCamel<NoticeDto>(data);
  if (!isAdmin(ctx)) {
    const relevant = await audienceRelevant(db, ctx, noticeId);
    if (!relevant) throw new TenantBoundaryError();
  }
  if (notice.attachmentPath === null) {
    throw new NotFoundError("Notice has no attachment");
  }
  return signedBucketUrl(db, "notice-attachments", notice.attachmentPath);
}

/* --------------------------------- types --------------------------------- */

export interface NoticeDto {
  id: string;
  title: string;
  content: string;
  category: string;
  isPublished: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentBytes: number | null;
  createdBy: string | null;
  createdAt: string;
}
