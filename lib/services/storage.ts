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
