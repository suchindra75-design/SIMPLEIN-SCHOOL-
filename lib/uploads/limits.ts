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
export function declaredBodyTooLarge(
  contentLength: string | null,
  limit: number = SERVER_ACTION_BODY_LIMIT_BYTES,
): boolean {
  if (contentLength === null) return false;
  const n = Number(contentLength);
  return Number.isFinite(n) && n > limit;
}

export const PAYLOAD_TOO_LARGE_MESSAGE = "Upload is too large: files must be 4 MB or less in total";

/** A request body over the limit (API routes answer 413 PAYLOAD_TOO_LARGE). */
export class PayloadTooLargeError extends Error {
  constructor(message: string = PAYLOAD_TOO_LARGE_MESSAGE) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Parse a multipart request body while never holding more than `limit`
 * bytes of it. A declared Content-Length over the limit is refused before
 * anything is read; otherwise the stream is counted as it arrives (chunked
 * uploads declare no length) and no longer read once it passes the limit.
 * `request.formData()` alone would buffer and parse the whole body first.
 */
export async function readFormDataWithinLimit(
  request: Request,
  limit: number = SERVER_ACTION_BODY_LIMIT_BYTES,
  message: string = PAYLOAD_TOO_LARGE_MESSAGE,
): Promise<FormData> {
  if (declaredBodyTooLarge(request.headers.get("content-length"), limit)) {
    throw new PayloadTooLargeError(message);
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        // Stop reading; the rest is never buffered. (No cancel(): with
        // undici-backed bodies a cancel races an in-flight chunk and raises
        // an unhandled rejection. The server discards the unread remainder.)
        reader.releaseLock();
        throw new PayloadTooLargeError(message);
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}
