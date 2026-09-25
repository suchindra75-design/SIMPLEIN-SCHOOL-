import {
  authorizeSchool,
  requireSession,
  type TenantContext,
} from "@/lib/auth/session";

/**
 * Tenant context resolution. The ONLY legal source of school_id for queries
 * is the server-side session — never query params, bodies, or headers.
 */
export async function getTenantContext(): Promise<TenantContext> {
  return requireSession();
}

/**
 * Guard helper: scope value must equal the session school.
 * Throws TenantBoundaryError, which the API layer maps to 404 NOT_FOUND
 * (avoids leaking cross-tenant record existence).
 */
export function assertSameSchool(ctx: TenantContext, rowSchoolId: string): void {
  authorizeSchool(
    {
      authUserId: "",
      profile: {
        id: ctx.userId,
        authUserId: "",
        schoolId: ctx.schoolId,
        email: "",
        fullName: "",
        phone: null,
        isActive: ctx.isActive,
      },
      school: {
        id: ctx.schoolId,
        name: "",
        slug: "",
        timezone: "",
        logoPath: null,
        isActive: true,
      },
      roles: ctx.roles,
    },
    rowSchoolId,
  );
}
