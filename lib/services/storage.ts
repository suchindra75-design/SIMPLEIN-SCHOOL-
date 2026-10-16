import { ForbiddenError } from "@/lib/auth/session";
import { redactForLog } from "@/lib/errors/server-log";
import { ConflictError, NotFoundError, type DbClient } from "@/lib/services/errors";
import { MAX_DOCUMENT_BYTES, MAX_PHOTO_BYTES as UPLOAD_MAX_PHOTO_BYTES } from "@/lib/uploads/limits";

/** Unexpected Storage failure. Logged (redacted), shown as the generic message. */
export class StorageServiceError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(redactForLog(message));
    this.name = "StorageServiceError";
    this.code = code;
  }
}

interface StorageErrorLike {
  message: string;
  status?: number;
  statusCode?: string;
  code?: string;
}

/**
 * Map a Storage API rejection to an error users can act on. Storage answers
 * with HTTP 400 and puts the real reason in statusCode/code (e.g. "413" /
 * EntityTooLarge), so both are checked. Anything unrecognised stays generic.
 */
export function throwForStorage(error: StorageErrorLike, notFoundMessage = "File not found"): never {
  const status = error.statusCode ?? String(error.status ?? "");
  const code = error.code ?? "";
  if (status === "413" || code === "EntityTooLarge") {
    throw new ConflictError("The file is too large for this upload.");
  }
  if (status === "415" || code === "InvalidMimeType") {
    throw new ConflictError("This file type is not allowed.");
  }
  if (status === "409" || code === "KeyAlreadyExists" || code === "ResourceAlreadyExists" || code === "Duplicate") {
    throw new ConflictError("A file with this name was just uploaded. Please try again.");
  }
  if (status === "403" || status === "401" || code === "AccessDenied" || code === "Unauthorized") {
    throw new ForbiddenError("You do not have permission to change this file.");
  }
  if (status === "404" || code === "NoSuchKey" || code === "NoSuchBucket") {
    throw new NotFoundError(notFoundMessage);
  }
  throw new StorageServiceError(`storage: ${error.message}`, code || status || undefined);
}

/* ------------------------- content signatures (L4) ------------------------- */

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  return signature.every((value, i) => bytes[at + i] === value);
}

const PDF_MARKER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04]; // DOCX/XLSX are ZIP packages

/**
 * True when the file starts the way its declared type requires. Checked for
 * the types with a fixed signature; legacy Word/Excel and plain text have no
 * reliable one (Windows also labels .csv files as Excel) and pass unchanged.
 */
export function matchesDeclaredType(type: string, data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 1024));
  switch (type) {
    case "application/pdf":
      // The PDF header may follow up to 1 KB of leading bytes.
      for (let i = 0; i + PDF_MARKER.length <= bytes.length; i++) {
        if (startsWith(bytes, PDF_MARKER, i)) return true;
      }
      return false;
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWith(bytes, ZIP_LOCAL_HEADER);
    default:
      return true;
  }
}

export const PHOTO_BUCKETS = {
  student: "student-photos",
  teacher: "teacher-photos",
} as const;

export type PhotoKind = keyof typeof PHOTO_BUCKETS;

export const MAX_PHOTO_BYTES = UPLOAD_MAX_PHOTO_BYTES;
export const ALLOWED_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Tenant-prefixed storage path. The school_id segment is what RLS enforces. */
export function buildPhotoPath(
  schoolId: string,
  kind: PhotoKind,
  entityId: string,
  originalName: string,
): string {
  const ext = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const rand = Math.random().toString(36).slice(2, 10);
  return `schools/${schoolId}/${kind}s/${entityId}/${Date.now()}_${rand}.${safeExt}`;
}

/** Returns an error message, or null when the upload is acceptable. */
export function validatePhotoUpload(file: {
  size: number;
  type: string;
  name: string;
  bytes?: ArrayBuffer;
}): string | null {
  if (!ALLOWED_PHOTO_MIME.has(file.type)) {
    return "Photo must be JPEG, PNG, or WebP";
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return "Photo must be non-empty and under 2 MB";
  }
  if (file.name.trim() === "") {
    return "Photo must have a file name";
  }
  if (file.bytes !== undefined && !matchesDeclaredType(file.type, file.bytes)) {
    return "The photo's content does not match its type (JPEG, PNG, or WebP)";
  }
  return null;
}

/** Upload via the caller's client (admin-only per storage RLS). */
export async function uploadPhoto(
  db: DbClient,
  kind: PhotoKind,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await db.storage
    .from(PHOTO_BUCKETS[kind])
    .upload(path, bytes, { contentType, upsert: false });
  if (error !== null) throwForStorage(error);
}

/** Short-lived signed read URL (caller must already be authorized). */
export async function signedPhotoUrl(
  db: DbClient,
  kind: PhotoKind,
  path: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { data, error } = await db.storage
    .from(PHOTO_BUCKETS[kind])
    .createSignedUrl(path, expiresInSeconds);
  if (error !== null) throwForStorage(error, "Photo not found");
  if (data === null) throw new StorageServiceError("storage: no signed URL returned");
  return data.signedUrl;
}

/* ----------------------- homework attachments (Phase 9) ------------------ */

export const HOMEWORK_BUCKET = "homework-attachments";
/**
 * 4,000,000 bytes: uploads go through server actions/route handlers, and
 * Vercel caps a function request body at 4.5 MB including multipart overhead.
 * See lib/uploads/limits.ts (requests with several files share this budget).
 */
export const MAX_HOMEWORK_FILE_BYTES = MAX_DOCUMENT_BYTES;

/** PDF / images / Office docs — macro-enabled formats are blocked. */
export const ALLOWED_HOMEWORK_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
/** Macro-enabled Office, executables/scripts, and types a browser renders as
 *  active content (HTML/SVG/XML) — never stored under their own extension. */
const BLOCKED_EXTENSIONS = new Set([
  "docm", "dotm", "xlsm", "xltm", "xlam", "pptm",
  "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "jar", "sh", "js", "mjs",
  "html", "htm", "xhtml", "svg", "xml", "hta",
]);

/** Tenant-prefixed attachment path (RLS enforces the school segment). */
export function buildAttachmentPath(
  schoolId: string,
  folder: string,
  entityId: string,
  originalName: string,
): string {
  const ext = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const safeExt = BLOCKED_EXTENSIONS.has(ext) ? "bin" : ext.slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 10);
  return `schools/${schoolId}/${folder}/${entityId}/${Date.now()}_${rand}.${safeExt}`;
}

/** Returns an error message, or null when the upload is acceptable. */
export function validateHomeworkUpload(file: {
  size: number;
  type: string;
  name: string;
  bytes?: ArrayBuffer;
}): string | null {
  if (!ALLOWED_HOMEWORK_MIME.has(file.type)) {
    return "Attachment type is not allowed";
  }
  if (file.size <= 0 || file.size > MAX_HOMEWORK_FILE_BYTES) {
    return "Attachment must be non-empty and under 4 MB";
  }
  if (file.name.trim() === "") {
    return "Attachment must have a file name";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return "Macro-enabled, executable or web-page files are not allowed";
  }
  if (file.bytes !== undefined && !matchesDeclaredType(file.type, file.bytes)) {
    return "The file's content does not match its type";
  }
  return null;
}

/** Upload via the caller's client (admin/teacher per storage RLS). */
export async function uploadHomeworkAttachment(
  db: DbClient,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await db.storage
    .from(HOMEWORK_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error !== null) throwForStorage(error);
}

/** Short-lived signed read URL (caller must already be authorized). */
export async function signedHomeworkUrl(
  db: DbClient,
  path: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { data, error } = await db.storage
    .from(HOMEWORK_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error !== null) throwForStorage(error, "Attachment not found");
  if (data === null) throw new StorageServiceError("storage: no signed URL returned");
  return data.signedUrl;
}

/* ------------------- generic bucket helpers (Phase 10) ------------------- */

/** Shared document allowlist (PDF/images/Office; macros blocked) — used by
 *  homework AND notice attachments. */
export const validateDocumentUpload = validateHomeworkUpload;

/** Upload to any private bucket via the caller's client. */
export async function uploadToBucket(
  db: DbClient,
  bucket: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await db.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: false });
  if (error !== null) throwForStorage(error);
}

/** Short-lived signed read URL for any private bucket (caller authorized). */
export async function signedBucketUrl(
  db: DbClient,
  bucket: string,
  path: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error !== null) throwForStorage(error);
  if (data === null) throw new StorageServiceError("storage: no signed URL returned");
  return data.signedUrl;
}
