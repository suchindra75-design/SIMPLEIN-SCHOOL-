import { ZodError } from "zod";
import {
  AuthError,
  ForbiddenError,
  InactiveUserError,
  MissingProfileError,
  TenantBoundaryError,
} from "@/lib/auth/session";
import { fail } from "@/lib/api/response";
import { logServerError, newReference } from "@/lib/errors/server-log";

/**
 * Map authorization/domain errors to the standard API error envelope.
 * Never leaks stack traces, secrets, or SQL internals to clients.
 */
export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return fail("UNAUTHENTICATED", "Authentication required");
  }
  if (error instanceof InactiveUserError) {
    return fail("FORBIDDEN", "Account is disabled");
  }
  if (error instanceof MissingProfileError) {
    return fail("FORBIDDEN", "Account is not provisioned for this school");
  }
  if (error instanceof ForbiddenError) {
    return fail("FORBIDDEN", "Insufficient permissions");
  }
  if (error instanceof TenantBoundaryError) {
    return fail("NOT_FOUND", "Not found");
  }
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Invalid request", error.flatten());
  }
  // Redacted log line + reference only; raw database messages can echo data.
  const reference = newReference();
  logServerError("api", error, reference);
  return fail("INTERNAL", `Unexpected error (Reference: ${reference})`);
}
