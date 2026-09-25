import {
  ForbiddenError,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";

/**
 * Link-scope predicates for Phase 3 services. These mirror the SQL helpers
 * (teacher_can_access_section / parent_can_access_student) so the API layer
 * fails with 404 BEFORE touching data, while RLS re-enforces at the DB.
 * Scope violations are TenantBoundaryError (404) to avoid existence leaks.
 */

export function isAdmin(ctx: SessionContext): boolean {
  return ctx.roles.includes("SCHOOL_ADMIN");
}

/** Sections a teacher may touch: class-teacher sections + assigned sections. */
export function teacherSectionIds(scope: {
  classTeacherSectionIds: readonly string[];
  assignedSectionIds: readonly string[];
}): Set<string> {
  return new Set([...scope.classTeacherSectionIds, ...scope.assignedSectionIds]);
}

export function assertTeacherSectionAccess(
  ctx: SessionContext,
  sectionId: string,
  sections: Set<string>,
): void {
  if (isAdmin(ctx)) return;
  if (!ctx.roles.includes("TEACHER") || !sections.has(sectionId)) {
    throw new TenantBoundaryError();
  }
}

export function assertParentStudentAccess(
  ctx: SessionContext,
  studentId: string,
  linkedStudentIds: Set<string>,
): void {
  if (isAdmin(ctx)) return;
  if (!ctx.roles.includes("PARENT") || !linkedStudentIds.has(studentId)) {
    throw new TenantBoundaryError();
  }
}

/** Parents/Teachers have no write access in Phase 3 (read-only roles). */
export function assertCanWritePeople(ctx: SessionContext): void {
  if (!isAdmin(ctx)) {
    throw new ForbiddenError("Only School Admins can modify people records");
  }
}
