import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import {
  buildAttachmentPath,
  signedBucketUrl,
  uploadToBucket,
  validateDocumentUpload,
} from "@/lib/services/storage";

/**
 * PYQs (Previous Year Questions) service (Phase 12). School-managed bank;
 * private `pyqs` bucket, tenant-prefixed paths, signed URLs only. Students
 * read their school's bank (filterable); admin manages. Archive = soft-delete.
 */

const PYQ_COLUMNS =
  "id, school_id, class_id, subject_id, year_label, exam_board_name, title, file_bucket, file_path, file_name, file_mime, file_bytes, solution_bucket, solution_path, solution_name, solution_mime, solution_bytes, answer_key_path, answer_key_name, uploaded_by, is_active, created_at, classes(name), subjects(name)";

const PYQS_BUCKET = "pyqs";

export interface PyqFilters {
  classId?: string;
  subjectId?: string;
  yearLabel?: string;
  examBoardName?: string;
  includeInactive?: boolean;
  page: number;
  limit: number;
}

export interface PyqDto {
  id: string;
  classId: string;
  subjectId: string;
  yearLabel: string;
  examBoardName: string;
  title: string | null;
  fileName: string;
  fileMime: string;
  fileBytes: number;
  solutionName: string | null;
  answerKeyName: string | null;
  isActive: boolean;
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
  createdAt: string;
}

/** Browse the school's PYQ bank (filterable). All roles read. */
export async function listPyqs(
  db: DbClient,
  ctx: SessionContext,
  f: PyqFilters,
): Promise<{ pyqs: PyqDto[]; total: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const from = (f.page - 1) * f.limit;
  let query = db
    .from("pyqs")
    .select(PYQ_COLUMNS, { count: "exact" })
    .eq("school_id", ctx.profile.schoolId)
    .order("created_at", { ascending: false })
    .range(from, from + f.limit - 1);
  if (f.classId !== undefined) query = query.eq("class_id", f.classId);
  if (f.subjectId !== undefined) query = query.eq("subject_id", f.subjectId);
  if (f.yearLabel !== undefined) query = query.eq("year_label", f.yearLabel);
  if (f.examBoardName !== undefined) {
    query = query.ilike("exam_board_name", `%${f.examBoardName.replace(/[%_]/g, "")}%`);
  }
  if (f.includeInactive !== true) query = query.eq("is_active", true);
  const { data, error, count } = await query;
  throwForPostgrest(error);
  return { pyqs: toCamel<PyqDto[]>(data ?? []), total: count ?? 0 };
}

function validatePyqFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  return validateDocumentUpload(file);
}

/**
 * Create a PYQ with its files. Admin only, audited.
 * Multipart payloads: file (required), solution?/answerKey? (optional).
 */
export async function createPyq(
  db: DbClient,
  ctx: SessionContext,
  metadata: {
    classId: string;
    subjectId: string;
    yearLabel: string;
    examBoardName: string;
    title?: string | null;
  },
  files: {
    file: { name: string; type: string; size: number; bytes: ArrayBuffer };
    solution?: { name: string; type: string; size: number; bytes: ArrayBuffer } | null;
    answerKey?: { name: string; type: string; size: number; bytes: ArrayBuffer } | null;
  },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const problem = validatePyqFile(files.file);
  if (problem !== null) throw new ConflictError(problem);
  if (
    files.solution !== null &&
    files.solution !== undefined &&
    validatePyqFile(files.solution) !== null
  ) {
    throw new ConflictError("Solution file is invalid");
  }
  if (
    files.answerKey !== null &&
    files.answerKey !== undefined &&
    validatePyqFile(files.answerKey) !== null
  ) {
    throw new ConflictError("Answer key file is invalid");
  }
  // Class/subject must be in this school (404 on cross-tenant).
  for (const [table, id] of [
    ["classes", metadata.classId],
    ["subjects", metadata.subjectId],
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

  const filePath = buildAttachmentPath(ctx.profile.schoolId, "pyqs", metadata.classId, files.file.name);
  await uploadToBucket(db, PYQS_BUCKET, filePath, files.file.bytes, files.file.type);
  let solutionPath: string | null = null;
  let solutionName: string | null = null;
  let solutionMime: string | null = null;
  if (files.solution !== null && files.solution !== undefined) {
    solutionPath = buildAttachmentPath(ctx.profile.schoolId, "pyqs", metadata.classId, files.solution.name);
    await uploadToBucket(db, PYQS_BUCKET, solutionPath, files.solution.bytes, files.solution.type);
    solutionName = files.solution.name;
    solutionMime = files.solution.type;
  }
  let answerKeyPath: string | null = null;
  let answerKeyName: string | null = null;
  if (files.answerKey !== null && files.answerKey !== undefined) {
    answerKeyPath = buildAttachmentPath(ctx.profile.schoolId, "pyqs", metadata.classId, files.answerKey.name);
    await uploadToBucket(db, PYQS_BUCKET, answerKeyPath, files.answerKey.bytes, files.answerKey.type);
    answerKeyName = files.answerKey.name;
  }

  const { data, error } = await db
    .from("pyqs")
    .insert({
      school_id: ctx.profile.schoolId,
      class_id: metadata.classId,
      subject_id: metadata.subjectId,
      year_label: metadata.yearLabel,
      exam_board_name: metadata.examBoardName,
      title: metadata.title ?? null,
      file_bucket: PYQS_BUCKET,
      file_path: filePath,
      file_name: files.file.name,
      file_mime: files.file.type,
      file_bytes: files.file.size,
      solution_bucket: solutionPath === null ? null : PYQS_BUCKET,
      solution_path: solutionPath,
      solution_name: solutionName,
      solution_mime: solutionMime,
      solution_bytes: files.solution?.size ?? null,
      answer_key_path: answerKeyPath,
      answer_key_name: answerKeyName,
      uploaded_by: ctx.profile.id,
      is_active: true,
    })
    .select("id")
    .single();
  if (error !== null || data === null) {
    // Best-effort cleanup: don't strand orphan files.
    const orphans = [filePath, solutionPath, answerKeyPath].filter(
      (p): p is string => p !== null,
    );
    await db.storage.from(PYQS_BUCKET).remove(orphans).catch(() => undefined);
    throw new Error(`pyq_save_failed: ${error?.message}`);
  }
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "pyq.created", "pyqs", id, {
    classId: metadata.classId,
    subjectId: metadata.subjectId,
    year: metadata.yearLabel,
  });
  return { id };
}

/** Admin only, audited. Metadata edit. */
export async function updatePyq(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: { yearLabel?: string; examBoardName?: string; title?: string | null },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const update: Record<string, unknown> = {};
  if (patch.yearLabel !== undefined) update["year_label"] = patch.yearLabel;
  if (patch.examBoardName !== undefined) update["exam_board_name"] = patch.examBoardName;
  if (patch.title !== undefined) update["title"] = patch.title;
  if (Object.keys(update).length === 0) return { id };
  const { data, error } = await db
    .from("pyqs")
    .update(update)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "PYQ not found");
  await logAudit(db, ctx, "pyq.updated", "pyqs", id, {
    fields: Object.keys(update),
  });
  return { id: (data as { id: string }).id };
}

/** Admin only, audited. Archive/restore (soft-delete). */
export async function setPyqActive(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("pyqs")
    .update({ is_active: active })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "PYQ not found");
  await logAudit(db, ctx, active ? "pyq.restored" : "pyq.archived", "pyqs", id, {});
  return { id: (data as { id: string }).id };
}

/** Signed file URL (question/solution/answerKey); same-school read scope. */
export async function getPyqFileUrl(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  kind: "question" | "solution" | "answerKey",
): Promise<string> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { data, error } = await db
    .from("pyqs")
    .select(PYQ_COLUMNS)
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "PYQ not found");
  const row = data as unknown as {
    file_path: string;
    solution_path: string | null;
    answer_key_path: string | null;
    is_active: boolean;
  };
  if (!row.is_active) throw new NotFoundError("PYQ is archived");
  const path =
    kind === "question"
      ? row.file_path
      : kind === "solution"
        ? row.solution_path
        : row.answer_key_path;
  if (path === null) {
    throw new NotFoundError(
      kind === "solution" ? "No solution uploaded" : "No answer key uploaded",
    );
  }
  return signedBucketUrl(db, PYQS_BUCKET, path);
}
