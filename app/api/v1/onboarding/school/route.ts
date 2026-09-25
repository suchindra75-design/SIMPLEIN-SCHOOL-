import { timingSafeEqual } from "node:crypto";
import { authErrorResponse } from "@/lib/api/auth-errors";
import { fail, ok } from "@/lib/api/response";
import {
  createSchoolWithAdmin,
  OnboardingConflictError,
} from "@/lib/services/onboarding";
import { onboardingSchoolSchema } from "@/lib/validation/onboarding";

/**
 * School onboarding foundation: create a school + its first admin.
 * NOT a public signup — requires the server-only ONBOARDING_SECRET bearer
 * token, so ordinary users can never self-provision or self-assign.
 */
export async function POST(request: Request) {
  const secret = process.env["ONBOARDING_SECRET"];
  if (secret === undefined || secret === "") {
    console.error("[onboarding] ONBOARDING_SECRET is not configured");
    return fail("INTERNAL", "Onboarding is not configured");
  }
  const presented = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!isEqualSecret(presented, secret)) {
    return fail("FORBIDDEN", "Insufficient permissions");
  }

  try {
    const body: unknown = await request.json();
    const input = onboardingSchoolSchema.parse(body);
    const result = await createSchoolWithAdmin(input);
    return ok(result, undefined, 201);
  } catch (error) {
    if (error instanceof OnboardingConflictError) {
      return fail("CONFLICT", error.message);
    }
    return authErrorResponse(error);
  }
}

function isEqualSecret(presented: string | undefined, secret: string): boolean {
  if (presented === undefined) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
