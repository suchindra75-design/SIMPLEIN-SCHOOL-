import type { DbClient } from "@/lib/services/errors";

export const PHOTO_BUCKETS = {
  student: "student-photos",
  teacher: "teacher-photos",
} as const;

export type PhotoKind = keyof typeof PHOTO_BUCKETS;

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
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
  if (error !== null) {
    throw new Error(`photo_upload_failed: ${error.message}`);
  }
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
  if (error !== null || data === null) {
    throw new Error(`photo_url_failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/* ----------------------- homework attachments (Phase 9) ------------------ */

export const HOMEWORK_BUCKET = "homework-attachments";
export const MAX_HOMEWORK_FILE_BYTES = 10 * 1024 * 1024;

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
const BLOCKED_EXTENSIONS = new Set(["docm", "xlsm", "exe", "bat", "sh", "js"]);

/** Tenant-prefixed attachment path (RLS enforces the school segment). */
export function buildAttachmentPath(
  schoolId: string,
  entityId: string,
  originalName: string,
): string {
  const ext = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const safeExt = BLOCKED_EXTENSIONS.has(ext) ? "bin" : ext.slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 10);
  return `schools/${schoolId}/homework/${entityId}/${Date.now()}_${rand}.${safeExt}`;
}

/** Returns an error message, or null when the upload is acceptable. */
export function validateHomeworkUpload(file: {
  size: number;
  type: string;
  name: string;
}): string | null {
  if (!ALLOWED_HOMEWORK_MIME.has(file.type)) {
    return "Attachment type is not allowed";
  }
  if (file.size <= 0 || file.size > MAX_HOMEWORK_FILE_BYTES) {
    return "Attachment must be non-empty and under 10 MB";
  }
  if (file.name.trim() === "") {
    return "Attachment must have a file name";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return "Macro-enabled or executable files are not allowed";
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
  if (error !== null) {
    throw new Error(`homework_upload_failed: ${error.message}`);
  }
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
  if (error !== null || data === null) {
    throw new Error(`homework_url_failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}
