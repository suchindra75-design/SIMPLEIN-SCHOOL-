import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/api/response";
import { authErrorResponse } from "@/lib/api/auth-errors";
import { redactForLog } from "@/lib/errors/server-log";
import { PayloadTooLargeError } from "@/lib/uploads/limits";

/** Service threw because the (tenant-scoped) record does not exist. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Service hit a uniqueness/integrity conflict (e.g. duplicate admission no). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Unexpected database/PostgREST error. Its message is for server logs only,
 *  and is redacted here (quoted values, e-mails, numbers) so that no logger,
 *  including Next.js's own report of an uncaught error, prints submitted data. */
export class DatabaseError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(redactForLog(message));
    this.name = "DatabaseError";
    this.code = code;
  }
}

interface PostgrestErrorLike {
  code?: string;
  message: string;
}

/** User-facing text for database rejections whose raw message is not safe to show. */
const SAFE_DB_MESSAGES: Record<string, string> = {
  // Generic text: the raw Postgres message names internal constraints/indexes.
  "23505": "A record with these details already exists",
  "23503": "This record is linked to other records, so it cannot be changed or removed",
  "23514": "Some of the values are not allowed",
  "23502": "A required value is missing",
  "22P02": "Some of the values are not valid",
  "22007": "A date is not valid",
  "22008": "A date is out of range",
  "22003": "A number is out of range",
  "22001": "A value is too long",
  "42501": "You do not have permission to make this change",
};

/** Map Supabase/Postgres errors to domain errors. Cross-tenant reads surface
 *  as zero rows (RLS) → NotFoundError, preserving the 404 boundary. */
export function throwForPostgrest(
  error: PostgrestErrorLike | null,
  notFoundMessage = "Not found",
): void {
  if (error === null) return;
  if (error.code === "PGRST116") {
    throw new NotFoundError(notFoundMessage);
  }
  if (error.code === "SF001") {
    // Database business rule (migration 0022): the message is written for users.
    throw new ConflictError(error.message);
  }
  const safe = error.code === undefined ? undefined : SAFE_DB_MESSAGES[error.code];
  if (safe !== undefined) {
    throw new ConflictError(safe);
  }
  throw new DatabaseError(error.message, error.code);
}

/** Route-level catcher: domain errors → envelope; auth errors → auth mapper. */
export function routeErrorResponse(error: unknown) {
  if (error instanceof NotFoundError) {
    return fail("NOT_FOUND", error.message);
  }
  if (error instanceof ConflictError) {
    return fail("CONFLICT", error.message);
  }
  if (error instanceof PayloadTooLargeError) {
    return fail("PAYLOAD_TOO_LARGE", error.message);
  }
  return authErrorResponse(error);
}

export type DbClient = SupabaseClient;
