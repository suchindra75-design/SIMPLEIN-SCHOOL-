/**
 * OpenAPI 3.1 generator for the implemented /api/v1 REST surface.
 * Usage: node scripts/generate-openapi.mjs > docs/openapi.yaml
 * The registry below documents ACTUAL implemented endpoints (Phase 13 audit).
 */
import { writeFileSync } from "node:fs";

// [method, path, summary, auth, tags]
const ENDPOINTS = [
  ["get", "/api/v1/health", "Liveness probe (no auth)", "none", "system"],

  ["get", "/api/v1/auth/session", "Current auth + tenant context", "session", "auth"],
  ["post", "/api/v1/auth/logout", "Server-safe logout (clears cookies)", "session", "auth"],

  ["post", "/api/v1/onboarding/school", "Create school + first admin (ONBOARDING_SECRET bearer)", "bearer", "onboarding"],

  ["get", "/api/v1/schools/current", "Caller's own school", "session", "schools"],
  ["get", "/api/v1/users", "Paginated user directory (admin)", "admin", "users"],
  ["post", "/api/v1/users", "Create login + profile + role (TEACHER/PARENT/STUDENT)", "admin", "users"],
  ["get", "/api/v1/users/me", "Caller's profile + roles", "session", "users"],
  ["get", "/api/v1/users/{id}", "User detail (admin, same school)", "admin", "users"],
  ["patch", "/api/v1/users/{id}", "Update contact fields", "admin", "users"],
  ["post", "/api/v1/users/{id}/disable", "Deactivate user", "admin", "users"],
  ["post", "/api/v1/users/{id}/enable", "Re-activate user", "admin", "users"],
  ["post", "/api/v1/users/{id}/roles", "Grant TEACHER/PARENT/STUDENT", "admin", "users"],

  ["get", "/api/v1/teachers", "Paginated teacher directory", "admin,teacher", "teachers"],
  ["post", "/api/v1/teachers", "Create teacher profile", "admin", "teachers"],
  ["get", "/api/v1/teachers/{id}", "Teacher detail (scoped for parents)", "admin,teacher,parent-scoped", "teachers"],
  ["patch", "/api/v1/teachers/{id}", "Update teacher", "admin", "teachers"],
  ["get", "/api/v1/teachers/{id}/assignments", "Teacher's subject assignments", "admin,self-teacher", "teachers"],
  ["post", "/api/v1/teachers/{id}/assignments", "Assign subject+section", "admin", "teachers"],
  ["delete", "/api/v1/teachers/{id}/assignments/{assignmentId}", "Remove assignment", "admin", "teachers"],

  ["get", "/api/v1/parents", "Paginated parent directory", "admin,teacher", "parents"],
  ["post", "/api/v1/parents", "Create parent profile", "admin", "parents"],
  ["get", "/api/v1/parents/{id}", "Parent detail (self for parents)", "admin,teacher,self-parent", "parents"],
  ["patch", "/api/v1/parents/{id}", "Update parent", "admin", "parents"],
  ["get", "/api/v1/parents/{id}/children", "Linked children", "admin,self-parent", "parents"],
  ["post", "/api/v1/parents/{id}/children", "Link a child", "admin", "parents"],
  ["delete", "/api/v1/parents/{id}/children/{studentId}", "Unlink a child", "admin", "parents"],

  ["get", "/api/v1/students", "Paginated students (role-scoped)", "admin,teacher-scoped,parent-linked,student-self", "students"],
  ["post", "/api/v1/students", "Create student", "admin", "students"],
  ["get", "/api/v1/students/{id}", "Student detail + linked parents", "admin,teacher-scoped,parent-linked,student-self", "students"],
  ["patch", "/api/v1/students/{id}", "Update student", "admin", "students"],
  ["post", "/api/v1/students/import", "Excel/CSV import (preview/confirm)", "admin", "students"],
  ["get", "/api/v1/students/{id}/parents", "Linked parents of a student", "admin,teacher-scoped,parent-linked,student-self", "students"],
  ["post", "/api/v1/students/{id}/parents", "Link a parent", "admin", "students"],

  ["get", "/api/v1/classes", "Classes with sections", "session", "academic-structure"],
  ["post", "/api/v1/classes", "Create class", "admin", "academic-structure"],
  ["get", "/api/v1/classes/{id}", "Class detail", "session", "academic-structure"],
  ["patch", "/api/v1/classes/{id}", "Update class", "admin", "academic-structure"],
  ["get", "/api/v1/classes/{id}/sections", "Sections of a class", "session", "academic-structure"],
  ["post", "/api/v1/classes/{id}/sections", "Create section", "admin", "academic-structure"],
  ["get", "/api/v1/sections/{id}", "Section detail", "session", "academic-structure"],
  ["patch", "/api/v1/sections/{id}", "Update section (incl. class teacher)", "admin", "academic-structure"],
  ["get", "/api/v1/subjects", "Subject catalogue", "session", "academic-structure"],
  ["post", "/api/v1/subjects", "Create subject", "admin", "academic-structure"],
  ["patch", "/api/v1/subjects/{id}", "Update subject", "admin", "academic-structure"],
  ["get", "/api/v1/classes/{id}/subjects", "Subjects linked to a class", "session", "academic-structure"],
  ["post", "/api/v1/classes/{id}/subjects", "Link subject to class", "admin", "academic-structure"],
  ["delete", "/api/v1/classes/{id}/subjects", "Unlink subject (query: subjectId)", "admin", "academic-structure"],
  ["get", "/api/v1/academic-years", "Academic years", "session", "academic-structure"],
  ["post", "/api/v1/academic-years", "Create academic year", "admin", "academic-structure"],
  ["post", "/api/v1/academic-years/{id}/current", "Switch current year", "admin", "academic-structure"],

  ["get", "/api/v1/attendance/sections", "Sections the caller may view/mark", "admin,teacher", "attendance"],
  ["get", "/api/v1/attendance/sections/{sectionId}", "Marking payload (roster + session)", "admin,teacher-scoped", "attendance"],
  ["post", "/api/v1/attendance/sections/{sectionId}/save", "Save/upsert attendance (audited)", "admin,teacher-scoped", "attendance"],
  ["get", "/api/v1/attendance/sections/{sectionId}/summary", "One-date section summary", "admin,teacher-scoped", "attendance"],
  ["get", "/api/v1/attendance/students/{studentId}", "Student history (role-scoped)", "admin,teacher-scoped,parent-linked,student-self", "attendance"],
  ["get", "/api/v1/attendance/students/{studentId}/summary", "Student summary (leave excused)", "admin,teacher-scoped,parent-linked,student-self", "attendance"],

  ["get", "/api/v1/exams", "Exams (role-scoped)", "admin,teacher-scoped,parent-linked,student-self", "exams"],
  ["post", "/api/v1/exams", "Create exam + subject configs", "admin", "exams"],
  ["get", "/api/v1/exams/{id}", "Exam detail + schedules", "admin,teacher-scoped,parent-linked,student-self", "exams"],
  ["patch", "/api/v1/exams/{id}", "Update exam", "admin", "exams"],
  ["post", "/api/v1/exams/{id}/activate", "Activate exam", "admin", "exams"],
  ["post", "/api/v1/exams/{id}/deactivate", "Deactivate exam", "admin", "exams"],
  ["post", "/api/v1/exams/{id}/subjects", "Add subject config", "admin", "exams"],
  ["get", "/api/v1/exams/children/{studentId}", "Child's exam schedule", "admin,parent-linked,student-self", "exams"],
  ["patch", "/api/v1/exam-subjects/{id}", "Update subject exam config", "admin", "exams"],
  ["delete", "/api/v1/exam-subjects/{id}", "Remove subject from exam", "admin", "exams"],
  ["put", "/api/v1/exam-subjects/{id}/schedule", "Upsert room/invigilator", "admin", "exams"],
  ["delete", "/api/v1/exam-subjects/{id}/schedule", "Remove schedule row", "admin", "exams"],

  ["get", "/api/v1/marks/subjects", "Markable exam subjects", "admin,teacher", "marks"],
  ["get", "/api/v1/marks/subjects/{examSubjectId}", "Marks entry grid", "admin,teacher-scoped", "marks"],
  ["put", "/api/v1/marks/subjects/{examSubjectId}/save", "Bulk save marks (audited)", "admin,teacher-scoped", "marks"],
  ["post", "/api/v1/exam-subjects/{id}/lock", "Lock marks", "admin", "marks"],
  ["post", "/api/v1/exam-subjects/{id}/unlock", "Unlock marks", "admin", "marks"],
  ["post", "/api/v1/exam-subjects/{id}/publish", "Publish results", "admin", "marks"],
  ["post", "/api/v1/exam-subjects/{id}/unpublish", "Unpublish results", "admin", "marks"],
  ["get", "/api/v1/results/students/{studentId}", "Student result (published-only for parents/students)", "admin,teacher-scoped,parent-linked,student-self", "marks"],
  ["get", "/api/v1/results/exams/{examId}", "Marks review grid", "admin,teacher-scoped", "marks"],

  ["get", "/api/v1/grades", "Grading systems + rules", "admin", "grades"],
  ["post", "/api/v1/grades/create", "Create grading system", "admin", "grades"],
  ["patch", "/api/v1/grades/{id}", "Update grading system", "admin", "grades"],

  ["get", "/api/v1/report-cards", "Report cards for an exam", "admin,teacher-scoped", "report-cards"],
  ["get", "/api/v1/report-cards/students/{studentId}", "Report card payload (published-only for parents/students)", "admin,teacher-scoped,parent-linked,student-self", "report-cards"],
  ["post", "/api/v1/report-cards/students/{studentId}", "Generate snapshot + PDF", "admin", "report-cards"],
  ["get", "/api/v1/report-cards/{id}/pdf", "Signed PDF URL", "admin,teacher-scoped,parent-linked,student-self", "report-cards"],
  ["patch", "/api/v1/report-cards/{id}", "Update remarks", "admin", "report-cards"],

  ["get", "/api/v1/timetable/sections/{sectionId}", "Section weekly grid", "admin,teacher-scoped,parent-linked,student-self", "timetable"],
  ["post", "/api/v1/timetable/sections/{sectionId}", "Create slot (409 on conflicts)", "admin", "timetable"],
  ["patch", "/api/v1/timetable/slots/{id}", "Edit slot", "admin", "timetable"],
  ["delete", "/api/v1/timetable/slots/{id}", "Delete slot", "admin", "timetable"],
  ["get", "/api/v1/timetable/teachers/{teacherId}", "Teacher weekly grid", "admin,self-teacher", "timetable"],
  ["get", "/api/v1/timetable/me", "Caller-scoped timetable", "teacher,parent,student", "timetable"],

  ["get", "/api/v1/homework", "Homework (role-scoped)", "admin,teacher-scoped,parent-linked,student-self", "homework"],
  ["post", "/api/v1/homework/sections/{sectionId}", "Create homework", "admin,teacher-scoped-subject", "homework"],
  ["get", "/api/v1/homework/{id}", "Homework detail + attachments", "admin,teacher-scoped,parent-linked,student-self", "homework"],
  ["patch", "/api/v1/homework/{id}", "Edit homework (author/admin)", "admin,author-teacher", "homework"],
  ["delete", "/api/v1/homework/{id}", "Soft-delete homework", "admin,author-teacher", "homework"],
  ["post", "/api/v1/homework/{id}/attachments", "Upload attachment", "admin,author-teacher", "homework"],
  ["get", "/api/v1/homework/{id}/attachments/{attachmentId}", "Signed attachment URL", "admin,teacher-scoped,parent-linked,student-self", "homework"],

  ["get", "/api/v1/notices", "Audience-filtered notice feed", "session", "notices"],
  ["post", "/api/v1/notices/create", "Create notice (unpublished)", "admin", "notices"],
  ["get", "/api/v1/notices/{id}", "Notice detail (in-audience)", "session", "notices"],
  ["patch", "/api/v1/notices/{id}", "Edit notice/targets", "admin", "notices"],
  ["post", "/api/v1/notices/{id}/publish", "Publish + fan out notifications", "admin", "notices"],
  ["post", "/api/v1/notices/{id}/unpublish", "Unpublish", "admin", "notices"],
  ["delete", "/api/v1/notices/{id}", "Archive notice", "admin", "notices"],
  ["post", "/api/v1/notices/{id}/attachments", "Set attachment", "admin", "notices"],
  ["get", "/api/v1/notices/{id}/attachments/url", "Signed attachment URL", "session", "notices"],

  ["get", "/api/v1/notifications", "Own inbox", "session", "notifications"],
  ["get", "/api/v1/notifications/unread-count", "Unread badge number", "session", "notifications"],
  ["post", "/api/v1/notifications/{id}/read", "Mark one as read", "self", "notifications"],
  ["post", "/api/v1/notifications/read-all", "Mark all as read", "self", "notifications"],

  ["get", "/api/v1/fees/structures", "Fee structures (parent: assigned only)", "admin,parent-linked,student-self", "fees"],
  ["post", "/api/v1/fees/structures/create", "Create fee structure", "admin", "fees"],
  ["patch", "/api/v1/fees/structures/{id}", "Edit structure (frozen after verified records)", "admin", "fees"],
  ["post", "/api/v1/fees/structures/{id}/assign", "Assign to students (concession)", "admin", "fees"],
  ["get", "/api/v1/fees/students/{studentId}", "Fee summary + history (records only, no processing)", "admin,parent-linked,student-self", "fees"],
  ["post", "/api/v1/fees/student-fees/{studentFeeId}/records", "Record payment received (offline)", "admin", "fees"],
  ["post", "/api/v1/fees/payment-records/{id}/verify", "Verify record (maker≠checker)", "admin", "fees"],
  ["post", "/api/v1/fees/payment-records/{id}/void", "Void record (maker≠checker)", "admin", "fees"],
  ["post", "/api/v1/fees/payment-records/{id}/receipt", "Upload receipt", "admin", "fees"],
  ["get", "/api/v1/fees/payment-records/{id}/receipt/url", "Signed receipt URL", "admin,parent-linked,student-self", "fees"],

  ["post", "/api/v1/promotions/preview", "Promotion preview (proposals)", "admin", "promotions"],
  ["post", "/api/v1/promotions/promote", "Approve promotion batch (history preserved)", "admin", "promotions"],

  ["get", "/api/v1/pyqs", "PYQ bank (filterable)", "session", "pyqs"],
  ["post", "/api/v1/pyqs/create", "Upload PYQ (+solution/answer key)", "admin", "pyqs"],
  ["patch", "/api/v1/pyqs/{id}", "Edit metadata", "admin", "pyqs"],
  ["post", "/api/v1/pyqs/{id}", "Archive/restore (query: active)", "admin", "pyqs"],
  ["get", "/api/v1/pyqs/{id}/file", "Signed file URL (question/solution/answerKey)", "session", "pyqs"],
];

const SECURITY_BY_AUTH = {
  none: [],
  session: [{ sessionCookie: [] }],
  bearer: [{ onboardingSecret: [] }],
  admin: [{ sessionCookie: [] }],
  self: [{ sessionCookie: [] }],
  teacher: [{ sessionCookie: [] }],
  "self-teacher": [{ sessionCookie: [] }],
  "author-teacher": [{ sessionCookie: [] }],
  "teacher-scoped": [{ sessionCookie: [] }],
  "teacher-scoped-subject": [{ sessionCookie: [] }],
  "parent-linked": [{ sessionCookie: [] }],
  "self-parent": [{ sessionCookie: [] }],
  "student-self": [{ sessionCookie: [] }],
  "admin,teacher": [{ sessionCookie: [] }],
  "admin,teacher,parent-scoped": [{ sessionCookie: [] }],
  "admin,teacher,self-parent": [{ sessionCookie: [] }],
  "admin,self-parent": [{ sessionCookie: [] }],
  "admin,self-teacher": [{ sessionCookie: [] }],
  "admin,teacher-scoped": [{ sessionCookie: [] }],
  "admin,teacher-scoped-subject": [{ sessionCookie: [] }],
  "admin,parent-linked,student-self": [{ sessionCookie: [] }],
  "admin,teacher-scoped,parent-linked,student-self": [{ sessionCookie: [] }],
  "admin,author-teacher": [{ sessionCookie: [] }],
  teacher: [{ sessionCookie: [] }],
  "teacher,parent,student": [{ sessionCookie: [] }],
};

const yaml = [];
yaml.push("openapi: 3.1.0");
yaml.push("info:");
yaml.push("  title: SIMPLEIN SCHOOL ERP API (V1)");
yaml.push("  description: |");
yaml.push("    Multi-tenant school ERP by SIMPLEIN SOLUTIONS LLP. Records-only fee");
yaml.push("    tracking (NO online payments). Every endpoint enforces authentication,");
yaml.push("    RBAC, and tenant isolation server-side; cross-tenant ids return 404.");
yaml.push("    Generated by scripts/generate-openapi.mjs (Phase 13).");
yaml.push("  version: 1.0.0");
yaml.push("servers:");
yaml.push("  - url: /api/v1");
yaml.push("    description: Same-origin REST API");
yaml.push("tags:");
const tagNames = [...new Set(ENDPOINTS.map((e) => e[4]))];
for (const t of tagNames) yaml.push(`  - name: ${t}`);
yaml.push("components:");
yaml.push("  securitySchemes:");
yaml.push("    sessionCookie:");
yaml.push("      type: apiKey");
yaml.push("      in: cookie");
yaml.push("      description: Supabase Auth session (httpOnly, SameSite=Lax).");
yaml.push("    onboardingSecret:");
yaml.push("      type: http");
yaml.push("      scheme: bearer");
yaml.push("      description: Server-only ONBOARDING_SECRET (not a user session).");
yaml.push("  schemas:");
yaml.push("    Envelope:");
yaml.push("      type: object");
yaml.push("      description: Success { data, meta? } or error { error: { code, message } }.");
yaml.push("    ApiError:");
yaml.push("      type: object");
yaml.push("      properties:");
yaml.push("        error:");
yaml.push("          type: object");
yaml.push("          properties:");
yaml.push("            code: { type: string }");
yaml.push("            message: { type: string }");
yaml.push("    Pagination:");
yaml.push("      type: object");
yaml.push("      properties:");
yaml.push("        page: { type: integer, minimum: 1 }");
yaml.push("        limit: { type: integer, minimum: 1, maximum: 100 }");
yaml.push("        total: { type: integer }");
yaml.push("security:");
yaml.push("  - sessionCookie: []");
yaml.push("paths:");

for (const [method, path, summary, auth, tag] of ENDPOINTS) {
  yaml.push(`  ${path}:`);
  yaml.push(`    ${method}:`);
  yaml.push(`      tags: [${tag}]`);
  yaml.push(`      summary: ${summary}`);
  yaml.push("      responses:");
  yaml.push("        \"200\":");
  yaml.push("          description: Success (envelope).");
  yaml.push("          content:");
  yaml.push("            application/json:");
  yaml.push("              schema: { $ref: '#/components/schemas/Envelope' }");
  yaml.push("        \"401\":");
  yaml.push("          description: Unauthenticated (except no-auth endpoints).");
  yaml.push("        \"403\":");
  yaml.push("          description: Forbidden (role/permission failure; onboarding secret invalid).");
  yaml.push("        \"404\":");
  yaml.push("          description: Not found OR cross-tenant id (existence not leaked).");
  yaml.push("        \"409\":");
  yaml.push("          description: Conflict (duplicates, locked marks, double-booking, overpayment).");
  yaml.push("        \"422\":");
  yaml.push("          description: Validation error (Zod).");
  yaml.push("        \"429\":");
  yaml.push("          description: Rate limited (Retry-After header).");
  const security = SECURITY_BY_AUTH[auth] ?? [{ sessionCookie: [] }];
  yaml.push("      security:");
  for (const s of security) {
    const key = Object.keys(s)[0];
    yaml.push(`        - ${key}: []`);
  }
}

const out = yaml.join("\n") + "\n";
writeFileSync("docs/openapi.yaml", out);
console.log(`Wrote docs/openapi.yaml (${ENDPOINTS.length} operations)`);
