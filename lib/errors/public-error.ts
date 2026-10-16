import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import {
  AuthError,
  ForbiddenError,
  InactiveUserError,
  MissingProfileError,
  TenantBoundaryError,
} from "@/lib/auth/session";
import { ConflictError, NotFoundError } from "@/lib/services/errors";
import { logServerError, newReference } from "@/lib/errors/server-log";

export { logServerError, newReference, redactForLog } from "@/lib/errors/server-log";

/**
 * What a user may see when something fails, and what the server logs.
 *
 * Errors the app raises on purpose (not found, conflicts, permission, form
 * validation) carry messages written for users and pass through. Anything
 * else (Postgres/PostgREST/storage errors, bugs) may contain table names,
 * constraint names or submitted values, so the user gets a generic message
 * with a short reference, and the server logs a redacted line with the same
 * reference. Never logged: error details/hints, request bodies, tokens.
 */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function publicErrorMessage(error: unknown, scope: string): string {
  // Next.js uses thrown errors for redirect()/notFound(); never swallow them.
  unstable_rethrow(error);

  if (
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    (error instanceof Error && error.name === "OnboardingConflictError")
  ) {
    return error.message;
  }
  if (error instanceof AuthError) return "Please sign in again.";
  if (error instanceof InactiveUserError) return "Your account is disabled. Contact your school.";
  if (error instanceof MissingProfileError) return "Your account is not set up for this school yet.";
  if (error instanceof ForbiddenError) return error.message || "You do not have permission to do that.";
  if (error instanceof TenantBoundaryError) return error.message || "Not found";
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return `Please check the form${field ? ` (${field})` : ""}: ${issue?.message ?? "invalid value"}`;
  }

  const reference = newReference();
  logServerError(scope, error, reference);
  return `${GENERIC_ERROR_MESSAGE} (Reference: ${reference})`;
}
