/**
 * RBAC — single source of truth for roles and permissions.
 * Backend enforcement is mandatory; frontend gates are UX only.
 * No role strings may be hard-coded outside this file.
 */

export const APP_ROLES = [
  "SCHOOL_ADMIN",
  "TEACHER",
  "PARENT",
  "STUDENT",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Resources mirror the API module groups in docs/API.md. */
export const RESOURCES = [
  "school",
  "users",
  "students",
  "parents",
  "teachers",
  "classes",
  "subjects",
  "attendance",
  "exams",
  "marks",
  "report-cards",
  "timetable",
  "homework",
  "notices",
  "notifications",
  "fees",
  "documents",
] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = "read" | "write" | "manage";

/**
 * Static permission matrix: role × resource → allowed actions.
 * - SCHOOL_ADMIN: full control within own school.
 * - TEACHER: link-scoped (assigned sections); enforced per-request with
 *   requireTeachesSection(), not by this matrix alone.
 * - PARENT: link-scoped (linked children); enforced per-request with
 *   requireLinkToStudent(), not by this matrix alone.
 * - STUDENT: dormant in V1 — deny by default.
 */
const MATRIX: Record<AppRole, Partial<Record<Resource, Action[]>>> = {
  SCHOOL_ADMIN: {
    school: ["read", "manage"],
    users: ["read", "write", "manage"],
    students: ["read", "write", "manage"],
    parents: ["read", "write", "manage"],
    teachers: ["read", "write", "manage"],
    classes: ["read", "write", "manage"],
    subjects: ["read", "write", "manage"],
    attendance: ["read", "write", "manage"],
    exams: ["read", "write", "manage"],
    marks: ["read", "write", "manage"],
    "report-cards": ["read", "write", "manage"],
    timetable: ["read", "write", "manage"],
    homework: ["read", "write", "manage"],
    notices: ["read", "write", "manage"],
    notifications: ["read", "write"],
    fees: ["read", "write", "manage"],
    documents: ["read", "write", "manage"],
  },
  TEACHER: {
    students: ["read"],
    classes: ["read"],
    subjects: ["read"],
    attendance: ["read", "write"],
    exams: ["read"],
    marks: ["read", "write"],
    "report-cards": ["read"],
    timetable: ["read"],
    homework: ["read", "write"],
    notices: ["read"],
    notifications: ["read", "write"],
    documents: ["read"],
  },
  PARENT: {
    students: ["read"],
    attendance: ["read"],
    exams: ["read"],
    marks: ["read"],
    "report-cards": ["read"],
    timetable: ["read"],
    homework: ["read"],
    notices: ["read"],
    notifications: ["read", "write"],
    fees: ["read"],
    documents: ["read"],
  },
  STUDENT: {
    // Dormant in V1: no grants. Any future student dashboard must add
    // explicit entries here plus tests before shipping.
  },
};

/** Pure check used by API guards and unit tests. */
export function hasPermission(
  roles: readonly AppRole[],
  resource: Resource,
  action: Action,
): boolean {
  const rank: Record<Action, number> = { read: 1, write: 2, manage: 3 };
  return roles.some((role) => {
    const grants = MATRIX[role]?.[resource] ?? [];
    // "manage" implies "write" implies "read".
    return grants.some((g) => rank[g] >= rank[action]);
  });
}
