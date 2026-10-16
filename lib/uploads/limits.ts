/**
 * Upload size budget (shared by the browser, server actions and API routes).
 *
 * Every upload is one multipart POST to a server action or an API route, and
 * Vercel rejects function request bodies over 4.5 MB before any app code runs
 * (the user would see a bare 413). One request can carry several files (a
 * question paper with its solution and answer key), so the budget is for all
 * files in the request together, not per file.
 */

/** Vercel's function request-body limit, taken as 4.5 × 10^6 bytes. */
export const PLATFORM_REQUEST_BODY_LIMIT_BYTES = 4_500_000;

/** Room for multipart boundaries, part headers and the non-file fields
 *  (about 200 bytes per part in practice). */
export const MULTIPART_RESERVE_BYTES = 256 * 1024;

/** All files in one request together (about 3.8 MiB, shown as "4 MB"). */
export const MAX_FILES_PER_REQUEST_BYTES = 4_000_000;

/** Server action body limit (next.config.mjs serverActions.bodySizeLimit):
 *  the file budget plus the multipart reserve, below the platform limit. */
export const SERVER_ACTION_BODY_LIMIT_BYTES = MAX_FILES_PER_REQUEST_BYTES + MULTIPART_RESERVE_BYTES;

/** One document (homework/notice attachment, fee receipt, question paper). */
export const MAX_DOCUMENT_BYTES = MAX_FILES_PER_REQUEST_BYTES;

/** Student/teacher photos. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Error message when the files of one request exceed the budget, else null. */
export function checkRequestFiles(files: readonly { name: string; size: number }[]): string | null {
  const present = files.filter((f) => f.size > 0);
  const total = present.reduce((sum, f) => sum + f.size, 0);
  if (total <= MAX_FILES_PER_REQUEST_BYTES) return null;
  return present.length > 1
    ? `Files together must be 4 MB or less (these are ${formatMegabytes(total)}). Upload fewer or smaller files.`
    : `The file must be 4 MB or less (this one is ${formatMegabytes(total)}).`;
}

/** True when a request declares a body larger than the server will accept. */
export function declaredBodyTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const n = Number(contentLength);
  return Number.isFinite(n) && n > SERVER_ACTION_BODY_LIMIT_BYTES;
}
