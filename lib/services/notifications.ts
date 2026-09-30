import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { toCamel } from "@/lib/services/camel";
import {
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";

/**
 * In-app notification service (Phase 10). Recipient resolution is SERVER-
 * SIDE only (never the browser). Fan-out resolves recipients per audience
 * type, dedupes, and inserts as batched chunks — queued semantics without a
 * job queue in V1 (documented limitation: the insert happens in-request;
 * large fan-outs are chunked but not background).
 */

export type NotificationType =
  | "NOTICE"
  | "HOMEWORK"
  | "EXAM"
  | "RESULT"
  | "ATTENDANCE"
  | "ACCOUNT";

export interface Audience {
  type: "SCHOOL" | "CLASS" | "SECTION" | "TEACHERS" | "PARENTS";
  classId?: string | null;
  sectionId?: string | null;
}

export interface FanOutInput {
  type: NotificationType;
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  audience: Audience;
}

const CHUNK = 500;

/**
 * Resolve the recipient user ids for an audience (server-side, tenant-safe).
 * - SCHOOL → all active school users.
 * - CLASS → admins + teachers of the class's sections + parents of students in the class.
 * - SECTION → admins + the class teacher + subject teachers + parents of students in the section.
 * - TEACHERS → all active teachers (no admins — teacher-only channel).
 * - PARENTS → all active parents.
 */
export async function resolveRecipients(
  db: DbClient,
  ctx: SessionContext,
  audience: Audience,
): Promise<string[]> {
  const schoolId = ctx.profile.schoolId;
  const recipientIds = new Set<string>();

  if (audience.type === "TEACHERS" || audience.type === "PARENTS") {
    const table = audience.type === "TEACHERS" ? "teachers" : "parents";
    const { data, error } = await db
      .from(table)
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("is_active", true);
    throwForPostgrest(error);
    for (const r of data as { user_id: string | null }[]) {
      if (r.user_id !== null) recipientIds.add(r.user_id);
    }
    return [...recipientIds];
  }

  if (audience.type === "SCHOOL") {
    const { data, error } = await db
      .from("users")
      .select("id")
      .eq("school_id", schoolId)
      .eq("is_active", true);
    throwForPostgrest(error);
    for (const r of data as { id: string }[]) recipientIds.add(r.id);
    return [...recipientIds];
  }

  // CLASS / SECTION: admins + teachers + parents of the class/section.
  // Admins resolved via user_roles (no embeds — works everywhere).
  const { data: adminRoles, error: adminError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "SCHOOL_ADMIN");
  throwForPostgrest(adminError);
  const adminIds = (adminRoles as { user_id: string }[]).map((r) => r.user_id);
  if (adminIds.length > 0) {
    const { data: adminUsers, error: adminUsersError } = await db
      .from("users")
      .select("id")
      .in("id", adminIds)
      .eq("school_id", schoolId)
      .eq("is_active", true);
    throwForPostgrest(adminUsersError);
    for (const r of adminUsers as { id: string }[]) recipientIds.add(r.id);
  }

  const sectionFilter =
    audience.type === "SECTION"
      ? db
          .from("sections")
          .select("id, class_teacher_id")
          .eq("id", audience.sectionId ?? "")
          .eq("school_id", schoolId)
      : db
          .from("sections")
          .select("id, class_teacher_id")
          .eq("class_id", audience.classId ?? "")
          .eq("school_id", schoolId);
  const { data: sections, error: secError } = await sectionFilter;
  throwForPostgrest(secError);
  const sectionRows = sections as { id: string; class_teacher_id: string | null }[];
  const sectionIds = sectionRows.map((s) => s.id);
  if (sectionIds.length === 0) return [...recipientIds];

  // Teachers: class teachers + subject assignees of those sections (batched).
  const classTeacherIds = sectionRows
    .map((s) => s.class_teacher_id)
    .filter((id): id is string => id !== null);
  const { data: ts, error: tsError } = await db
    .from("teacher_subjects")
    .select("teacher_id")
    .in("section_id", sectionIds)
    .eq("school_id", schoolId);
  throwForPostgrest(tsError);
  const subjectTeacherIds = [...new Set((ts as { teacher_id: string }[]).map((r) => r.teacher_id))];
  const teacherMap = await teacherUserIds(db, [
    ...new Set([...classTeacherIds, ...subjectTeacherIds]),
  ]);
  for (const id of classTeacherIds) {
    const uid = teacherMap.get(id);
    if (uid !== undefined && uid !== "") recipientIds.add(uid);
  }
  for (const id of subjectTeacherIds) {
    const uid = teacherMap.get(id);
    if (uid !== undefined && uid !== "") recipientIds.add(uid);
  }

  // Parents of students in those sections (batched).
  const { data: students, error: stuError } = await db
    .from("students")
    .select("id")
    .in("section_id", sectionIds)
    .eq("school_id", schoolId);
  throwForPostgrest(stuError);
  const studentIds = (students as { id: string }[]).map((s) => s.id);
  if (studentIds.length > 0) {
    const { data: links, error: linkError } = await db
      .from("student_parents")
      .select("parent_id")
      .in("student_id", studentIds);
    throwForPostgrest(linkError);
    const parentIds = [...new Set((links as { parent_id: string }[]).map((r) => r.parent_id))];
    const parentMap = await parentUserIds(db, parentIds);
    for (const id of parentIds) {
      const uid = parentMap.get(id);
      if (uid !== undefined && uid !== "") recipientIds.add(uid);
    }
  }
  return [...recipientIds];
}

async function teacherUserIds(db: DbClient, teacherIds: readonly string[]): Promise<Map<string, string>> {
  // Batch fetch (no N+1): one query for all teachers.
  const map = new Map<string, string>();
  if (teacherIds.length === 0) return map;
  const { data, error } = await db
    .from("teachers")
    .select("id, user_id")
    .in("id", [...teacherIds]);
  if (error !== null) throw new Error(error.message);
  for (const r of data as { id: string; user_id: string | null }[]) {
    map.set(r.id, r.user_id ?? "");
  }
  return map;
}

async function parentUserIds(db: DbClient, parentIds: readonly string[]): Promise<Map<string, string>> {
  // Batch fetch (no N+1): one query for all parents.
  const map = new Map<string, string>();
  if (parentIds.length === 0) return map;
  const { data, error } = await db
    .from("parents")
    .select("id, user_id")
    .in("id", [...parentIds]);
  if (error !== null) throw new Error(error.message);
  for (const r of data as { id: string; user_id: string | null }[]) {
    map.set(r.id, r.user_id ?? "");
  }
  return map;
}

/**
 * Fan out a notification to an audience. Resolves recipients server-side,
 * dedupes, skips empty user ids, inserts in chunks. Returns the recipient
 * count. Auditing is the CALLER's job (the notice publish flow audits with
 * its own action).
 */
export async function fanOutNotification(
  db: DbClient,
  ctx: SessionContext,
  input: FanOutInput,
): Promise<{ recipients: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  const recipientIds = (await resolveRecipients(db, ctx, input.audience)).filter(
    (id) => id !== "",
  );
  for (let i = 0; i < recipientIds.length; i += CHUNK) {
    const chunk = recipientIds.slice(i, i + CHUNK);
    const { error } = await db.from("notifications").insert(
      chunk.map((userId) => ({
        school_id: ctx.profile.schoolId,
        user_id: userId,
        type: input.type,
        title: input.title,
        message: input.message,
        entity: input.entity ?? null,
        entity_id: input.entityId ?? null,
      })),
    );
    throwForPostgrest(error);
  }
  return { recipients: recipientIds.length };
}

/* --------------------------------- inbox --------------------------------- */

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  type?: NotificationType;
  page: number;
  limit: number;
}

/** The caller's own inbox (recipient isolation at RLS + service). */
export async function listNotifications(
  db: DbClient,
  ctx: SessionContext,
  f: NotificationFilters,
): Promise<{ notifications: NotificationDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("notifications")
    .select("id, type, title, message, entity, entity_id, is_read, created_at", {
      count: "exact",
    })
    .eq("user_id", ctx.profile.id)
    .order("created_at", { ascending: false })
    .range(from, from + f.limit - 1);
  if (f.unreadOnly === true) query = query.eq("is_read", false);
  if (f.type !== undefined) query = query.eq("type", f.type);
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { notifications: toCamel<NotificationDto[]>(data ?? []), total: count ?? 0 };
}

/** Badge number (unread count for the caller only). */
export async function unreadCount(
  db: DbClient,
  ctx: SessionContext,
): Promise<number> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.profile.id)
    .eq("is_read", false);
  throwForPostgrest(error);
  return count ?? 0;
}

/** Mark one as read (idempotent; own rows only). */
export async function markNotificationRead(
  db: DbClient,
  ctx: SessionContext,
  id: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { data, error } = await db
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.profile.id)
    .select("id")
    .single();
  throwForPostgrest(error, "Notification not found");
  return { id: (data as { id: string }).id };
}

/** Mark all as read (own rows only). */
export async function markAllNotificationsRead(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ updated: boolean }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { error } = await db
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", ctx.profile.id)
    .eq("is_read", false);
  throwForPostgrest(error);
  return { updated: true };
}
