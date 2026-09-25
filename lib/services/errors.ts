import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/api/response";
import { authErrorResponse } from "@/lib/api/auth-errors";

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

interface PostgrestErrorLike {
  code?: string;
  message: string;
}

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
  if (error.code === "23505") {
    throw new ConflictError(`Duplicate value: ${error.message}`);
  }
  throw new Error(error.message);
}

/** Route-level catcher: domain errors → envelope; auth errors → auth mapper. */
export function routeErrorResponse(error: unknown) {
  if (error instanceof NotFoundError) {
    return fail("NOT_FOUND", error.message);
  }
  if (error instanceof ConflictError) {
    return fail("CONFLICT", error.message);
  }
  return authErrorResponse(error);
}

export type DbClient = SupabaseClient;
