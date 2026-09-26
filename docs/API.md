# SIMPLEIN SCHOOL ERP — V1 API Design

Base path: **`/api/v1`**. REST + JSON. This document is the normative V1
contract; generated OpenAPI (`openapi/openapi.json` + Swagger UI) is a roadmap
item before pilot (see `ARCHITECTURE.md` §8, §16).

## Conventions (apply to every module)

- **Auth:** session cookie (Supabase). Unauthenticated → `401 UNAUTHENTICATED`.
- **Tenant scope:** derived server-side from session (`users.school_id`);
  endpoints accept NO `schoolId` param. Cross-school id → `404 NOT_FOUND`
  (never 403-with-existence, to avoid an existence oracle).
- **Authorization:** each endpoint lists minimum permission, e.g.
  `admin` · `teacher:assigned` · `parent:linked` · `self`. Backend-enforced;
  frontend gates are UX only.
- **Envelope:** success `{ "data": T }`, lists add
  `"meta": { "page": 1, "limit": 20, "total": 137 }`. Errors:
  `{ "error": { "code": "NOT_FOUND", "message": "Student not found" } }`.
  Stable codes: `UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR |
  CONFLICT | RATE_LIMITED | INTERNAL`. Validation failures → `422`.
- **Pagination:** `GET` lists accept `?page&limit` (default 20, cap 100).
- **Idempotency:** bulk writes (attendance, marks) accept `Idempotency-Key`.
- **Audit:** mutating endpoints marked `＋audit` append to `audit_logs`.
- **Validation:** Zod schemas in `lib/validation/<module>.ts`, shared UI + API.

Permission shorthands: `admin` = SCHOOL_ADMIN of own school;
`teacher:assigned` = TEACHER with class_teacher/teacher_subjects link to the
target section; `parent:linked` = PARENT with `student_parents` link to the
target student; `published` = result/mark data gated on publish flags.

---

## /auth — Authentication — ✅ implemented (Phase 2)

UI-driven login uses the `loginAction` server action (`/login` page); the
REST surface below serves session context and logout. Password
change/reset endpoints remain roadmap items (Supabase-owned flows).

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/auth/session` | session | Returns `{ authUserId, profile, school, roles }`. 401 anonymous; 403 inactive/unprovisioned. |
| POST | `/auth/logout` | session | Server-side `signOut()`, clears cookies. |
| GET | `/schools/current` | session | Caller's own school (tenant from session; no `schoolId` param). ✅ |
| GET | `/users/me` | session | Caller's own profile + role grants. ✅ |
| POST | `/onboarding/school` | `ONBOARDING_SECRET` bearer (no user session) | Creates school + first admin (transactional, best-effort rollback). 409 on duplicate slug/email. Zod-validated. ✅ |

## /schools — School / Tenant (remaining rows = roadmap)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/schools/current` | session | Caller's own school profile + branding. |
| PATCH | `/schools/current` | admin ＋audit | Name, address, contacts, branding colors, logo `documentId`. |
| GET | `/schools/current/academic-years` | session | Ordered years. |
| POST | `/schools/current/academic-years` | admin ＋audit | Enforces single `is_current`. |
| PATCH | `/schools/current/academic-years/:id` | admin ＋audit | Rollover sets new current (transactional). |
| GET | `/schools/current/settings` | admin | Notification prefs, attendance/grading defaults. |
| PATCH | `/schools/current/settings` | admin ＋audit | Validated settings patch. |

## /users — Users — ✅ implemented (Phase 3)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/users` | admin | Paginated directory; `?role&isActive&search`. |
| POST | `/users` | admin ＋audit | Creates Auth identity + profile + role (TEACHER/PARENT only) + links existing same-school teacher/parent profile. SCHOOL_ADMIN grant refused. Temp password never logged/returned. |
| GET | `/users/:id` | admin | Same-school only (404 otherwise). |
| PATCH | `/users/:id` | admin ＋audit | Contact fields (name/phone). Status/roles via dedicated routes. |
| POST | `/users/:id/disable` | admin ＋audit | `is_active=false` + Auth ban (best-effort); cannot disable self. |
| POST | `/users/:id/enable` | admin ＋audit | Re-activates + un-bans. |
| POST | `/users/:id/roles` | admin ＋audit | Grants TEACHER/PARENT only. |

## /students — Student Management — ✅ implemented (Phase 3)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/students` | admin / teacher:assigned / parent:linked | `?search&classId&sectionId&status&page&limit`; teachers pre-scoped to assigned sections (out-of-scope filter → 404); parents to linked children. Server-side, paginated. |
| POST | `/students` | admin ＋audit | `admissionNo` unique per school (409); section∈class enforced; enrollment snapshot synced. |
| GET | `/students/:id` | admin / teacher:assigned / parent:linked | Includes linked parents. 404 unless authorized. |
| PATCH | `/students/:id` | admin ＋audit | Profile/placement/status; placement change re-syncs enrollment. |
| POST | `/students/import` | admin ＋audit | Multipart `{ file, mapping? }` → preview; JSON `{ rows }` → confirm. ≤200 rows / 2 MB. Format: `docs/STUDENT_IMPORT.md`. |
| GET | `/students/:id/parents` | admin / teacher:assigned / parent:linked | Linked parents (same scope as student read). |
| POST | `/students/:id/parents` | admin ＋audit | `{ parentId, relation, isPrimary }`; same-school enforced + trigger. |
| GET | `/students/:id/documents` | — | Roadmap (documents module). |
| POST | `/students/:id/documents` | — | Roadmap (documents module). |
| DELETE | `/students/:id/documents/:docId` | — | Roadmap (documents module). |

## /parents — Parent Management — ✅ implemented (Phase 3)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/parents` | admin / teacher | Paginated; `?search&isActive`. Teachers: contact need. |
| POST | `/parents` | admin ＋audit | Contact profile (login linked later via `/users`). |
| GET | `/parents/:id` | admin / teacher / self-parent | Parents read own row only. |
| PATCH | `/parents/:id` | admin ＋audit | Contact fields + active flag. |
| GET | `/parents/:id/children` | admin / self-parent | Linked students with class/section. |
| POST | `/parents/:id/children` | admin ＋audit | `{ studentId, relation, isPrimary }` — same-school only (trigger backstops; cross-school links forbidden in V1). |
| DELETE | `/parents/:id/children/:studentId` | admin ＋audit | Unlink (audited; history preserved in audit log). |
| GET | `/parents/me/children` | parent:linked | Roadmap (child-selector endpoint; same data reachable today via dashboard scope). |

## /teachers — Teacher Management — ✅ implemented (Phase 3)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/teachers` | admin / teacher | Paginated directory; `?search&isActive`. |
| POST | `/teachers` | admin ＋audit | Profile (`employeeNo` unique per school, 409 on clash). Login linked later via `/users`. |
| GET | `/teachers/:id` | admin / teacher / scoped-parent | Parents: only teachers of linked children's sections. |
| PATCH | `/teachers/:id` | admin ＋audit | Contact/qualification/active flag. |
| GET | `/teachers/:id/assignments` | admin / self-teacher | Subject assignments with names. |
| POST | `/teachers/:id/assignments` | admin ＋audit | `{ subjectId, sectionId, academicYearId? }` → `teacher_subjects`; every id tenant-verified. |
| DELETE | `/teachers/:id/assignments/:assignmentId` | admin ＋audit | |
| GET | `/teachers/me/sections` | teacher | Roadmap endpoint; live data served today by the teacher dashboard scope. |

## /classes · /sections · /subjects · /academic-years — ✅ implemented (Phase 3)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/classes` | session | School list with sections (no year binding — §Phase 3 decision). |
| POST | `/classes` | admin ＋audit | `{ name, orderIndex }`; name unique per school. |
| GET | `/classes/:id` | session | With sections + class teachers. |
| PATCH | `/classes/:id` | admin ＋audit | Rename/reorder/active. |
| GET | `/classes/:id/sections` | session | |
| POST | `/classes/:id/sections` | admin ＋audit | `{ name, orderIndex, classTeacherId?, room? }`; teacher tenant-verified. |
| GET | `/sections/:id` | session | With class + class teacher. |
| PATCH | `/sections/:id` | admin ＋audit | Incl. class-teacher assignment (drives teacher authz). |
| GET | `/sections/:id/students` | — | Roadmap (classmate roster; privacy-reviewed when built). |
| GET | `/subjects` | session | School catalogue. |
| POST | `/subjects` | admin ＋audit | `{ name, code?, orderIndex }`; name unique per school. |
| PATCH | `/subjects/:id` | admin ＋audit | Incl. active flag. |
| GET | `/classes/:id/subjects` | session | Subjects linked to the class. |
| POST | `/classes/:id/subjects` | admin ＋audit | `{ subjectId }` → `class_subjects`. |
| DELETE | `/classes/:id/subjects?subjectId=` | admin ＋audit | Unlink (exam-reference guard lands with Exams). |
| GET | `/academic-years` | session | Ordered years. |
| POST | `/academic-years` | admin ＋audit | `{ name, startsOn, endsOn, isCurrent }`; single-current enforced. |
| POST | `/academic-years/:id/current` | admin ＋audit | Switch current year. |

## /attendance — Attendance — ✅ implemented (Phase 4)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/attendance/sections` | admin / teacher | Sections the caller may view/mark: admin → all active; teacher → assigned (class-teacher ∪ subject assignee). |
| GET | `/attendance/sections/:sectionId?date=` | admin / teacher:assigned | Marking-screen payload: section + academic year + enrolled roster (enrollment model, pointer fallback) + existing session/records. Date validated (school-local, no future). 404 on cross-tenant/out-of-scope. |
| POST | `/attendance/sections/:sectionId` → `/save` | admin / teacher:assigned ＋audit | Save/upsert `{ date, records: [{ studentId, status: PRESENT\|ABSENT\|LEAVE, remark? }] }`. Idempotent (UNIQUE section+date; records UNIQUE session+student). Validates per-student enrollment for the applicable year (409 otherwise). Audits old→new diffs. |
| GET | `/attendance/sections/:sectionId/summary?date=` | admin / teacher:assigned | One-date section summary: present/absent/leave counts + percentage (server-side). |
| GET | `/attendance/students/:studentId?from&to&page&limit` | admin / teacher:assigned / parent:linked | Daily history joined to session dates; paginated. 404 unless authorized (parent: linked children only). |
| GET | `/attendance/students/:studentId/summary?from&to` | admin / teacher:assigned / parent:linked | Counts + percentage (LEAVE excused — excluded from denominator). |

Percentage rule: `present ÷ (present + absent)`; LEAVE excused; null when no
counted days. Dates are school-local (`schools.timezone`); the server never
derives the date from its own timezone.

## /exams — Exams — ✅ implemented (Phase 5)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/exams` | admin / teacher / parent | Auto-scoped list: admin → school; teacher → exams whose class contains an assigned section; parent → linked children's classes. `?academicYearId&classId&page&limit`. 404 on out-of-scope classId. |
| POST | `/exams` | admin ＋audit | `{ name, academicYearId, classId, startsOn, endsOn, subjects?: [{ subjectId, maxMarks, passingMarks, examDate?, startTime?, endTime? }] }` in one batch. 404 cross-tenant class/year; 409 invalid config/duplicate name. |
| GET | `/exams/:id` | admin / teacher:assigned-class / parent:linked-child-class | Detail with subjects + room/invigilator schedules. 404 unless authorized. |
| PATCH | `/exams/:id` | admin ＋audit | Name/window; subject dates re-validated against the new window (409). |
| POST | `/exams/:id/activate` | admin ＋audit | Explicit, audited activation. |
| POST | `/exams/:id/deactivate` | admin ＋audit | Explicit, audited deactivation. |
| POST | `/exams/:id/subjects` | admin ＋audit | Add subject config: `{ subjectId, maxMarks, passingMarks, examDate?, startTime?, endTime? }`; 409 on dup/invalid. |
| GET | `/exams/children/:studentId` | admin / parent:linked | Exam schedule for one linked child (grouped with subjects). 404 unless linked. |
| PATCH | `/exam-subjects/:id` | admin ＋audit | Update marks config / schedule date-time; re-validated (409). |
| DELETE | `/exam-subjects/:id` | admin ＋audit | Remove subject from exam. |
| PUT | `/exam-subjects/:id/schedule` | admin ＋audit | Upsert 1:1 room/invigilator; invigilator tenant-verified (404). |
| DELETE | `/exam-subjects/:id/schedule` | admin ＋audit | Remove the schedule row (date/time config untouched). |

Marks entry/results are Phase 6 — this phase is configuration + schedules only.

## /marks · /grades · /results — Marks / Grades — ✅ implemented (Phase 6)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/marks/subjects?examId=` | admin / teacher | Markable exam subjects with lock/publish state; teacher → authorized only (class teacher → all subjects of the class; subject assignee → their subject). |
| GET | `/marks/subjects/:examSubjectId` | admin / teacher:authorized | Marks entry grid: subject state + roster (enrollment model, class pointer fallback) + existing marks. 404 unless authorized. |
| PUT | `/marks/subjects/:examSubjectId` | admin / teacher:authorized ＋audit | Bulk upsert `{ records: [{ studentId, marksObtained?, isAbsent? }], version? }`; validates 0 ≤ marks ≤ max + enrollment (409); teacher edits rejected when locked (409); grade computed server-side; audited with old→new diffs. |
| POST | `/exam-subjects/:id/lock` | admin ＋audit | Freezes teacher edits. |
| POST | `/exam-subjects/:id/unlock` | admin ＋audit | Re-enables edits (audited). |
| POST | `/exam-subjects/:id/publish` | admin ＋audit | Makes results visible to parents (read-only). |
| POST | `/exam-subjects/:id/unpublish` | admin ＋audit | Hides results from parents again. |
| GET | `/results/students/:studentId?examId=` | admin / teacher:assigned-class / parent:linked | Subject marks, totals, percentage, overall grade. Parents: PUBLISHED only (404 when unpublished/unlinked). |
| GET | `/results/exams/:examId?subjectId=` | admin / teacher:authorized | Marks review grid for an exam subject. |
| GET | `/grades` | admin | School's grading systems + rules. |
| POST | `/grades/create` | admin ＋audit | `{ name, isDefault, rules: [{ minPercentage, maxPercentage, grade, gradePoint? }] }`; bands validated non-overlapping (409). |
| PATCH | `/grades/:id` | admin ＋audit | Update system / replace rules. |

Result states: editable → locked (teacher edits rejected; admin corrections/
unlock only) → published (read-only to teachers/parents; parents see
published only). Grades are server-side from the school's configurable
percentage bands (CGPA-extensible via grade points); boundary percentages
resolve to the higher band.

## /report-cards — Report Cards — ✅ implemented (Phase 7)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/report-cards?examId=` | admin / teacher | Snapshots generated for an exam, with student names; teacher → students in assigned sections only. |
| GET | `/report-cards/students/:studentId?examId=` | admin / teacher:assigned-student / parent:linked | JSON payload (preview): school branding + student info + subject marks + totals + percentage + attendance + remarks + status. Reuses the Phase 6 result calc + Phase 4 attendance summary — no duplicated math. Parents: PUBLISHED only (404 when unpublished/unlinked). |
| POST | `/report-cards/students/:studentId` | admin ＋audit | Generate (or regenerate) the snapshot + PDF: `{ examId }`. Status = PUBLISHED when all subjects published, else DRAFT. PDF stored privately (tenant-prefixed path); orphan PDF cleaned on failure. |
| GET | `/report-cards/:id/pdf` | admin / teacher:assigned-student / parent:linked | Returns a short-lived **signed URL** of the generated PDF (never a public URL). Parents: PUBLISHED only. |
| PATCH | `/report-cards/:id` | admin ＋audit | Update remarks on the snapshot. |

Marks/grades/attendance calculations are reused from their services — the
report-card layer owns only snapshotting, PDF rendering, and access.

## /timetable — Timetable — ✅ implemented (Phase 8)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/timetable/sections/:sectionId` | admin / teacher:assigned / parent:linked-child-section | Weekly grid (day × period × subject/teacher/time/room). 404 unless authorized. |
| POST | `/timetable/sections/:sectionId` | admin ＋audit | Create a slot: `{ subjectId, teacherId?, academicYearId?, dayOfWeek (1–7), periodIndex, startsAt, endsAt, room? }`. 409 on section overlap / teacher double-booking / invalid time range; 404 cross-tenant refs. |
| PATCH | `/timetable/slots/:id` | admin ＋audit | Edit (teacher/time/room/day/period); clash check uses the slot's EFFECTIVE (merged) teacher, excluding itself (409). |
| DELETE | `/timetable/slots/:id` | admin ＋audit | |
| GET | `/timetable/teachers/:teacherId` | admin / self-teacher | Teacher's weekly grid across sections. 404 on cross-tenant/other teachers. |
| GET | `/timetable/me` | teacher / parent | Caller-scoped: teacher's own entries / linked children's sections' entries. |

Conflict rules: section overlap blocked by `UNIQUE(section, day, period)`;
teacher double-booking by a service pre-check + partial
`UNIQUE(year, teacher, day, period)`; periods are fully configurable per school.

## /homework — Homework

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/homework` | admin / teacher:assigned / parent:linked | `?sectionId&subjectId&from&dueBefore`; auto-scoped to caller's sections/children. |
| POST | `/homework` | admin / teacher:assigned ＋audit | `{ sectionId, subjectId, title, description, dueDate }` + optional attachment ids; queues parent notifications. |
| GET | `/homework/:id` | admin / teacher:assigned / parent:linked | Includes attachment metadata. |
| PATCH | `/homework/:id` | author-teacher / admin ＋audit | Edit window policy: teachers edit own until due date; admins always (audited). |
| DELETE | `/homework/:id` | author-teacher / admin ＋audit | Soft-delete (parents keep inbox copy marked withdrawn). |
| POST | `/homework/:id/attachments` | author-teacher / admin | Validated upload → `homework_attachments`. |

## /notices — Notices

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/notices` | session | Feed auto-filtered: school-wide + caller's classes/sections; `?category`. |
| POST | `/notices` | admin (+ teacher:assigned for CLASS scope, policy-flagged) ＋audit | `{ title, body, category, audience: {type, classId?, sectionId?}, expiresAt? }`; queues notifications. |
| GET | `/notices/:id` | session (in-audience) | 404 outside audience. |
| PATCH | `/notices/:id` | author / admin ＋audit | |
| DELETE | `/notices/:id` | author / admin ＋audit | Soft-delete; inbox copies marked withdrawn. |

## /notifications — Notifications (internal)

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/notifications` | session | Own inbox; `?unreadOnly&type&page`. |
| GET | `/notifications/unread-count` | session | Badge number. |
| POST | `/notifications/:id/read` | self | Idempotent mark-read. |
| POST | `/notifications/read-all` | self | |
| GET | `/notifications/preferences` | self | Non-critical opt-outs. |
| PATCH | `/notifications/preferences` | self | Attendance/result categories mandatory (reject opt-out). |

## /fees — Fee Tracking (records only, NO processing)

> No endpoint accepts card/UPI/wallet data, initiates transfers, or issues
> refunds. All amounts are staff-recorded receipts; corrections are new
> superseding records.

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/fee-structures` | admin / parent:linked | `?academicYearId&classId`; parents see structures assigned to linked children. |
| POST | `/fee-structures` | admin ＋audit | `{ name, academicYearId, classId?, dueDate, components: [{ name, amount }] }`. |
| PATCH | `/fee-structures/:id` | admin ＋audit | Blocked if assignments have verified records (`409`; create new structure instead). |
| POST | `/fee-structures/:id/assign` | admin ＋audit | `{ studentIds[], totalAmount?, dueDate? }` bulk assign (concession via per-student total snapshot). |
| GET | `/students/:id/fee-summary` | admin / parent:linked | `{ total, paid (verified), due, dueDate, status }` from `student_fee_balances` view. |
| GET | `/students/:id/fee-history` | admin / parent:linked | Verified + pending records timeline with receipt links. |
| POST | `/fee-assignments/:id/records` | admin ＋audit | `{ amount, paidOn, mode, referenceNo?, receiptDocumentId? }` — staff-recorded receipt. |
| POST | `/fee-payment-records/:id/verify` | admin (maker≠checker) ＋audit | Second-person verification; void path requires reason. |
| POST | `/fee-payment-records/:id/void` | admin ＋audit | `{ reason }`; record retained with `is_voided=true` (never hard-deleted). |
| GET | `/fees/defaulters` | admin | `?dueBefore&classId&page` — outstanding balances list. Paginated. |

## /documents — File metadata & access

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/documents/upload-url` | session (writer roles) | Returns direct-to-Storage signed upload URL after mime/size pre-validation. |
| POST | `/documents/confirm` | session (writer roles) | Registers `documents` row post-upload (checksum-verified). |
| GET | `/documents/:id` | owner-record permission | Returns short-lived **signed download URL** after RBAC + tenant/link check. No public passthrough. |
| DELETE | `/documents/:id` | admin ＋audit | Soft-delete; janitor purges Storage after retention (fee receipts immutable once verified — `409`). |

## Error & status codes (summary)

`200` read/update · `201` create · `204` unlink/mark-read where no body ·
`400` malformed · `401` unauthenticated/inactive · `403` forbidden (same-school
role failure) · `404` not found **or cross-tenant** · `409` conflict
(duplicate admission no, locked marks, double-booked teacher, immutable fee
structure) · `422` Zod validation · `429` rate-limited · `500` internal
(envelope only, details server-logged).
