# SIMPLEIN SCHOOL ERP — V1 Database Design

Companion to `docs/ARCHITECTURE.md` (§4, §7). Target: **PostgreSQL (Supabase)**.
Multi-tenancy: shared schema, `school_id` on every school-owned table,
enforced by Row Level Security. Conventions for all tables:

- PK: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ` (trigger).
- Tenant tables: `school_id UUID NOT NULL REFERENCES schools(id)` + RLS +
  composite indexes leading with `school_id`.
- Deletes are restrictive on student/marks/fee/audit data (no cascading loss).
- Money: `NUMERIC(12,2)`; percentages: `NUMERIC(5,2)`; dates: `DATE`, times: `TIME`.

Entity order below follows creation dependency (parents before children).

> ✅ **Phase 2 implemented:** `schools`, `users`, `user_roles` (+ `app_role`
> enum) per `supabase/migrations/0001_foundation.sql` and
> `0002_auth_tenant.sql`. All other entities remain planned (roadmap steps 3–6).

---

## 1. schools — ✅ implemented

**Purpose:** tenant root. One row per school. No `school_id` column (it IS the tenant).
**Key fields:** `id`, `name`, `slug UNIQUE`, `address`, `phone`, `email`,
`timezone TEXT DEFAULT 'Asia/Kolkata'` (Phase 2), `logo_path TEXT NULL`
(Storage path; FK to `documents` lands with the documents module),
`is_active BOOL`, `created_at/updated_at` (trigger-maintained).
**Relationships:** parent of every tenant table; `users.school_id`,
`academic_years.school_id`, …
**Indexes/constraints:** `UNIQUE(slug)`; `CHECK (char_length(name) >= 2)`.
**RLS (live):** members `SELECT` own school (`id = current_school_id()`);
`SCHOOL_ADMIN` may `UPDATE` own school; no authenticated `INSERT`/`DELETE`
(creation via trusted service-role onboarding only).

## 2. users — ✅ implemented

**Purpose:** login profile for every human (admin/teacher/parent; student rows
reserved for future). Links Supabase Auth identity to tenant + status.
**Key fields:** `id`, `auth_user_id UUID UNIQUE → auth.users(id)`,
`school_id → schools`,
`email`, `full_name`, `phone`,
`is_active BOOL DEFAULT true`, timestamps.
**Relationships:** `user_roles.user_id`; role-specific `teachers.user_id` /
`parents.user_id` (later phases).
**Indexes:** `UNIQUE(auth_user_id)`, `UNIQUE(school_id, email)`, `(school_id, is_active)`.
**Constraints:** login path rejects `is_active = false` (fail closed).
**RLS (live):** `SELECT` own row or same-school admin; `UPDATE` own
non-identity columns only — trigger `prevent_identity_change()` rejects any
row-level change to `school_id / auth_user_id / email / is_active`; no
authenticated `INSERT`/`DELETE` (provisioning via trusted server ops only).

## 3. roles: `user_roles` (roles as enum, no `roles` table needed in V1) — ✅ implemented

**Purpose:** role assignment. `app_role` enum: `SCHOOL_ADMIN | TEACHER | PARENT | STUDENT`.
`STUDENT` grantable but denied by policy in V1 (dormant).

**Purpose:** role assignment. `app_role` enum: `SCHOOL_ADMIN | TEACHER | PARENT | STUDENT`.
`STUDENT` grantable but denied by policy in V1 (dormant).
**Fields:** `user_id → users ON DELETE CASCADE`, `role app_role`,
`granted_by → users NULL`, `created_at`. PK `(user_id, role)`.
**Indexes:** `(role, user_id)`, `(user_id)`.

## 4. academic_years — ✅ implemented (Phase 3)

**Purpose:** school's session calendar; scopes enrollments (later: attendance, exams, fees).
**Fields:** `id`, `school_id`, `name` (e.g. `2026-27`), `starts_on DATE`,
`ends_on DATE`, `is_current BOOL`, timestamps.
**Constraints:** partial unique index `UNIQUE(school_id) WHERE is_current`
(one current year per school); `CHECK (ends_on > starts_on)`.
**Index:** `(school_id)`. No year is hard-coded; schools create future years
via API/UI. **RLS:** members read; admin writes.

## 5. classes & 6. sections — ✅ implemented (Phase 3)

**Phase 3 decision (delta from draft):** classes/sections are **school-level**,
not year-bound — year history lives in `student_enrollments` (§13), keeping
everyday queries simple while promotion never destroys history.
**`classes`:** `id`, `school_id`, `name` (configurable: Nursery/LKG/Grade 1…),
`order_index`, `is_active`, timestamps. **Unique:** `(school_id, name)`.
**`sections`:** `id`, `school_id`, `class_id → classes ON DELETE CASCADE`,
`name`, `order_index`, `class_teacher_id → teachers NULL`,
`room`, `is_active`, timestamps. **Unique:** `(class_id, name)`.
**Index:** `(school_id, class_id)`. Tenant triggers reject cross-school
class/teacher references. **RLS:** members read; admin writes.

## 7. students — ✅ implemented (Phase 3)

**Purpose:** student profile + current placement + academic identity.
Fields: `id`, `school_id`, `admission_no` (per-school unique),
`first_name`, `middle_name NULL`, `last_name`, `display_name`,
`dob DATE NULL`, `gender (male|female|other) NULL`, `photo_path TEXT NULL`
(private bucket path, §25 note), `address`, `guardian_phone`,
`admission_date`, current `class_id → classes NULL`,
`section_id → sections NULL`, `roll_number`,
`status (active|inactive|graduated|transferred)`, timestamps.
**Relationships:** `student_parents.student_id`; `student_enrollments.student_id`.
**Indexes:** `UNIQUE(school_id, admission_no)`; `(school_id, class_id, section_id)`;
`(school_id, status)`; `(school_id, last_name, first_name)`; partial unique
`(school_id, class_id, section_id, roll_number)` (roll unique within section).
**Integrity:** service verifies section∈class; trigger rejects cross-school
class/section refs. **RLS (link-scoped):** admin all; teachers assigned
sections only (unenrolled students admin-only); parents linked children only.

## 8. parents & 9. student_parents — ✅ implemented (Phase 3)

**`parents`:** contact profile, optional 1:1 `user_id → users` (login linked
later via user management).
Fields: `id`, `school_id`, `user_id UNIQUE NULL`, `full_name`, `phone`,
`email`, `address`, `is_active`, timestamps.
**Indexes:** `(school_id, is_active)`; `(school_id, phone)` (import reuse key).
**`student_parents`:** many-to-many both directions (one parent → many
children; one child → many guardians). No `parent_id` on students.
Fields: `student_id → students ON DELETE CASCADE`, `parent_id → parents ON DELETE CASCADE`,
`relation (father|mother|guardian|other)`, `is_primary BOOL`, `created_at`.
PK `(student_id, parent_id)`. **Index:** `(parent_id, student_id)`.
**Integrity:** `assert_link_same_school` trigger forbids cross-school links —
a student can never be linked to another school's parent at the DB layer.
This table is THE parent authorization primitive (`parent_can_access_student`).
**RLS:** admin full; parents own links; teachers links of assigned-section students.

## 10. teachers — ✅ implemented (Phase 3)

**Purpose:** teacher profile + employment status; login linked later via
optional 1:1 `user_id → users` (unlinked profiles allowed, e.g. created
before their login).
Fields: `id`, `school_id`, `user_id UNIQUE NULL`, `employee_no` (per-school unique),
`first_name`, `last_name`, `display_name`, `phone`, `email`, `qualification`,
`date_of_joining DATE NULL`, `photo_path TEXT NULL`, `is_active`, timestamps.
**Indexes:** `UNIQUE(school_id, employee_no)`; `(school_id, is_active)`.
**RLS:** self + school admins + school teachers + parents whose linked child
is taught by this teacher (class-teacher or subject assignment); admin writes.

## 11. subjects · 12. class_subjects · 13. teacher_subjects — ✅ implemented (Phase 3)

**`subjects`:** school's subject catalogue (configurable names/codes).
`id`, `school_id`, `name`, `code NULL`, `order_index`, `is_active`, timestamps.
`UNIQUE(school_id, name)` + partial `UNIQUE(school_id, code)`.
**`class_subjects`:** which subjects a class takes. `id`, `school_id`,
`class_id → classes ON DELETE CASCADE`, `subject_id → subjects ON DELETE CASCADE`,
`UNIQUE(class_id, subject_id)`, timestamps.
**`teacher_subjects`:** teacher↔subject↔section assignment — the second
teacher-authz path (with class-teacher link). `id`, `school_id`,
`teacher_id → teachers ON DELETE CASCADE`, `subject_id`, `section_id`,
`academic_year_id NULL` (NULL = current year), `UNIQUE(teacher_id, subject_id, section_id)`,
timestamps. **Index:** `(school_id, section_id)`.
A teacher gains NO blanket student access from this table — only the linked
sections. **RLS:** members read; admin writes.

## 14. Authorization helpers — ✅ implemented as RLS functions (Phase 3)

- `current_app_user_id()` / `current_school_id()` — session → tenant, never client input.
- `is_school_admin()` / `has_app_role(r)` — role checks.
- `current_teacher_id()` / `current_parent_id()` — profile links for the caller.
- `teacher_can_access_section(S)` — admin OR class-teacher OR subject assignee.
- `parent_can_access_student(St)` — admin OR `student_parents` link.
- Marks gating on publish flags lands with the Exams module.

## 15. attendance_sessions + attendance_records — ✅ implemented (Phase 4)

**Purpose:** daily attendance with an auditable grain. One session per
section per school-day; one record per student per session.
**`attendance_sessions`:** `id`, `school_id`, `academic_year_id → academic_years`,
`section_id → sections ON DELETE CASCADE`, `attendance_date DATE` (school-local),
`status (DRAFT|SUBMITTED) DEFAULT 'SUBMITTED'`, `created_by → users NULL`,
`updated_by → users NULL`, timestamps.
**Unique:** `(section_id, attendance_date)` — duplicate-session prevention at
the DB. **Indexes:** `(school_id, attendance_date DESC)`,
`(school_id, section_id, attendance_date DESC)`.
**`attendance_records`:** `id`, `school_id`, `attendance_session_id →
attendance_sessions ON DELETE CASCADE`, `student_id → students`,
`status attendance_status enum (PRESENT|ABSENT|LEAVE) NOT NULL`, `remark`,
`updated_by → users NULL`, timestamps. **Unique:** `(attendance_session_id, student_id)`.
**Indexes:** `(attendance_session_id)`, `(school_id, student_id, attendance_session_id)`
(student history + summary aggregation).
**Tenant triggers:** session→section/year and record→student cross-school
references rejected; `school_id` immutable. **RLS:** same-school reads;
teachers additionally scoped via `teacher_can_access_section()`; parents via
`parent_can_access_student()` (linked children only); writes admin + assigned
teachers only; parents read-only; STUDENT dormant (no policies).
**Percentage rule (one consistent rule):** PRESENT counts fully, ABSENT counts
against, LEAVE is excused (excluded from the denominator);
percentage = present ÷ (present + absent), null when no counted days.
Dates are school-local (schools.timezone); enrollment context from
`student_enrollments` (pointer fallback documented).

## 16. exams · exam_subjects · exam_schedules — ✅ implemented (Phase 5)

**`exams`:** class-scoped exam event per academic year (configurable names:
Unit Test 1, First Term Examination, …).
`id`, `school_id`, `academic_year_id → academic_years`, `class_id → classes
ON DELETE CASCADE`, `name`, `starts_on/ends_on DATE` (exam window,
`ends_on >= starts_on`), `is_active BOOL`, timestamps.
**Unique:** `(school_id, academic_year_id, class_id, name)` — duplicate
definitions blocked at the DB. **Index:** `(school_id, class_id, starts_on DESC)`,
`(school_id, academic_year_id)`.
**`exam_subjects`:** per-subject configuration — owns marks config + schedule.
`id`, `school_id`, `exam_id → exams ON DELETE CASCADE`, `subject_id → subjects
ON DELETE CASCADE`, `max_marks NUMERIC(6,2) CHECK (> 0)`, `passing_marks
NUMERIC(6,2) DEFAULT 0`, `exam_date DATE NULL`, `start_time/end_time TIME NULL`,
timestamps. **Unique:** `(exam_id, subject_id)`; **CHECK** `passing_marks <=
max_marks` (DB-enforced). **Index:** `(school_id, exam_id)`, `(school_id, exam_date)`.
**`exam_schedules`** (room/invigilator detail; kept separate so date changes
never touch marks config): `id`, `school_id`, `exam_subject_id → exam_subjects
ON DELETE CASCADE` (UNIQUE — 1:1), `room`, `invigilator_id → teachers NULL`,
timestamps.
**Tenant triggers:** exams→year/class, exam_subjects→exam/subject,
exam_schedules→exam_subject/invigilator cross-school references rejected;
`school_id` immutable. **RLS:** admins full; teachers see exams whose class
contains an assigned section (mirrored on subject/schedule tables via joins);
parents see exams of linked children's classes; writes admin-only.
Marks/results fields land in Phase 6 (this phase is configuration only).

## 17. marks — ✅ implemented (Phase 6)

**Purpose:** one score per student per exam-subject (+ result snapshot).
Fields: `id`, `school_id`, `exam_subject_id → exam_subjects ON DELETE CASCADE`,
`student_id → students`, `marks_obtained NUMERIC(6,2) NULL` (null when absent),
`is_absent BOOL DEFAULT false`, `grade TEXT NULL` (server-computed snapshot
from the school's grading rules), `entered_by → users NULL`, `updated_by →
users NULL`, `version INT DEFAULT 1` (optimistic locking), timestamps.
**Unique:** `(exam_subject_id, student_id)` — duplicate marks prevented.
**Indexes:** `(school_id, exam_subject_id)`, `(school_id, student_id)`.
**Constraints (DB-enforced):** `CHECK marks_obtained >= 0`; `CHECK (NOT
is_absent OR marks_obtained IS NULL)`; `validate_marks_row()` trigger rejects
marks > max_marks AND students not enrolled in the exam's class for the exam's
academic year (enrollment model first, class pointer fallback); tenant
triggers reject cross-school exam_subject/student references; `school_id`
immutable.
**Result states (on exam_subjects, Phase 6):** `is_locked BOOL DEFAULT false`
(teacher edits rejected at RLS AND service; admin corrections/unlock only),
`is_published BOOL DEFAULT false` (parents see published results only —
enforced in RLS AND service). Lock/unlock/publish/unpublish are admin-only,
audited.

## 18. grading_systems + grading_rules — ✅ implemented (Phase 6)

**Purpose:** configurable per-school grading — percentage bands (CGPA-
extensible via `grade_point`). NO hard-coded letter grades anywhere.
**`grading_systems`:** `id`, `school_id`, `name`, `is_default BOOL`,
timestamps. **Unique:** `(school_id, name)` + partial unique
`(school_id) WHERE is_default` (one default per school).
**`grading_rules`:** `id`, `school_id`, `grading_system_id → grading_systems
ON DELETE CASCADE`, `min_percentage NUMERIC(5,2) CHECK (>= 0)`,
`max_percentage NUMERIC(5,2) CHECK (<= 100)`, `grade TEXT`, `grade_point
NUMERIC(4,2) NULL`, `remark_template TEXT NULL`, timestamps.
**Unique:** `(grading_system_id, grade)`. **Index:** `(grading_system_id)`.
**Constraints:** `validate_grading_band()` trigger rejects overlapping bands
at the DB; the `validateGradingRules` engine re-checks in the service.
Grade computation is a pure function (`lib/services/grades/calc.ts`) —
unit-tested with boundary fixtures — shared by marks entry and results (no
duplicated logic). Boundary rule: a percentage on a shared boundary resolves
to the HIGHER band (90 → 90–100, not 80–89.99).

## 19. report_cards — ✅ implemented (Phase 7)

**Purpose:** generated result SNAPSHOT per (exam × student) — marks/grades/
attendance totals frozen at generation. The LIVE result publish state stays
on `exam_subjects` (§17) and is re-checked in the service; `status` here is
the generation-time snapshot.
Fields: `id`, `school_id`, `exam_id → exams ON DELETE CASCADE`, `student_id →
students`, `grading_system_id → grading_systems ON DELETE SET NULL`,
`total_obtained/max_total NUMERIC(8,2)`, `percentage NUMERIC(5,2) NULL`,
`cgpa NUMERIC(4,2) NULL`, `overall_grade TEXT NULL`, `attendance_percentage
NUMERIC(5,2) NULL`, `remarks TEXT NULL`, `pdf_path TEXT NULL` (private
`report-cards` bucket, signed access only), `status (DRAFT|PUBLISHED)`,
`published_by/published_at NULL`, `generated_by → users NULL`, timestamps.
**Unique:** `(exam_id, student_id)` — one snapshot; regeneration updates it.
**Indexes:** `(school_id, exam_id)`, `(school_id, student_id)`.
**Constraints:** `CHECK status IN ('DRAFT','PUBLISHED')`; tenant triggers
reject cross-school exam/student/grading_system references; `school_id`
immutable.
**RLS:** admins full (own school); teachers see snapshots of students in
assigned sections (student-level scope, mirrored by RLS via the exam→sections
join); parents see PUBLISHED snapshots of linked children only
(`parent_can_access_student` + status check); writes admin-only.

## 20. timetable_slots

**Purpose:** weekly class + teacher timetables (substitution deferred).
Fields: `id`, `school_id`, `academic_year_id`, `section_id → sections ON DELETE CASCADE`,
`day_of_week SMALLINT (1=Mon..7=Sun)`, `period_index INT`, `subject_id → subjects NULL`
(NULL = non-teaching), `teacher_id → teachers NULL`, `room`, `starts_at/ends_at TIME`,
timestamps. `UNIQUE(section_id, day_of_week, period_index)`;
conflict guard partial index prevents double-booking a teacher
(`UNIQUE(teacher_id, day_of_week, period_index)` scoped per year — enforced via
unique index on `(academic_year_id, teacher_id, day_of_week, period_index)`).
Parent/student view derives from `section_id`; teacher view from `teacher_id`.

## 21. homework (+ homework_attachments)

**`homework`:** `id`, `school_id`, `section_id → sections`, `subject_id → subjects`,
`teacher_id → teachers`, `title`, `description`, `assigned_on DATE`, `due_date DATE`,
timestamps. **Index:** `(school_id, section_id, due_date)` (parent "due this week" feed).
**`homework_attachments`:** `homework_id → homework ON DELETE CASCADE`,
`document_id → documents`, PK `(homework_id, document_id)`.
Parent visibility: homework for linked child's section only (join through `student_parents`).

## 22. notices + notice_audience

**`notices`:** `id`, `school_id`, `title`, `body`, `category
(GENERAL|CLASS|EXAM|HOLIDAY|URGENT)`, `published_by → users`, `published_at`,
`expires_at NULL`, `attachment_document_id → documents NULL`, timestamps.
**Index:** `(school_id, category, published_at DESC)`.
**`notice_audience`:** targets: `notice_id → notices ON DELETE CASCADE`,
`audience_type (SCHOOL|CLASS|SECTION)`, `class_id NULL`, `section_id NULL`.
Untargeted (no rows) = whole school. Parent/teacher feeds filter by their
sections + school-wide rows.

## 23. notifications

**Purpose:** per-user internal inbox (V1 delivery = in-app; see ARCHITECTURE §10).
Fields: `id`, `school_id`, `user_id → users ON DELETE CASCADE`, `type
(ATTENDANCE|HOMEWORK|EXAM|RESULT|NOTICE|FEE|ACCOUNT)`, `title`, `body`,
`entity TEXT NULL`, `entity_id UUID NULL`, `is_read BOOL DEFAULT false`,
timestamps. **Index:** `(school_id, user_id, is_read, created_at DESC)` (badge query).
`channel` enum reserved for post-V1 (SMS/WhatsApp) without schema change.

## 24. Fee tracking — `fee_structures` · `fee_components` · `student_fee_assignments` · `fee_payment_records`

> Naming is deliberate: **`fee_payment_records`** = offline amounts a school
> staff member recorded as received. No gateway, no settlement, no refunds —
> corrections are new superseding records (audited), never silent edits.

**`fee_structures`:** named fee plan per year (e.g. `2026-27 · Grade 5`).
`id`, `school_id`, `academic_year_id`, `name`, `class_id NULL` (NULL = applies to
listed assignments only), `due_date DATE`, `is_active BOOL`, timestamps.
**`fee_components`:** line items. `id`, `school_id`, `fee_structure_id → fee_structures
ON DELETE CASCADE`, `name` (Tuition/Transport/Lab), `amount NUMERIC(12,2)`,
timestamps. Structure total = Σ components (SQL view `fee_structure_totals`).
**`student_fee_assignments`:** which student owes which structure (allows
concessions/splits). `id`, `school_id`, `student_id → students`,
`fee_structure_id → fee_structures`, `total_amount NUMERIC` (snapshot at assign
time, supports concession), `due_date DATE`, `status (DUE|PARTIAL|PAID|OVERDUE|WAIVED)`,
timestamps. `UNIQUE(student_id, fee_structure_id)`.
**Index:** `(school_id, student_id, status)`, `(school_id, due_date)` (defaulter list).
**`fee_payment_records`:** ledger rows entered by staff. `id`, `school_id`,
`assignment_id → student_fee_assignments`, `amount NUMERIC`,
`paid_on DATE`, `mode (CASH|CHEQUE|BANK_TRANSFER|OTHER)`, `reference_no`,
`receipt_document_id → documents NULL`, `recorded_by → users`,
`verified_by → users NULL`, `is_voided BOOL DEFAULT false`, `version INT`, timestamps.
**Outstanding (per assignment)** = `total_amount − Σ(amount WHERE NOT is_voided
AND verified)` — computed in view `student_fee_balances`, never from client math.
Voiding requires `verified_by ≠ recorded_by` (maker-checker) + audit entry.
Receipt files live in the `fee-receipts` bucket; once linked to a verified record
the document row is immutable.

## 13b. student_enrollments — ✅ implemented (Phase 3)

**Purpose:** promotion-safe year history. Current placement stays on
`students` (fast queries); this table snapshots it per academic year.
`id`, `school_id`, `student_id → students ON DELETE CASCADE`,
`academic_year_id → academic_years`, `class_id`, `section_id`, `roll_number`,
`status (enrolled|completed|transferred|withdrawn)`, `created_at`.
`UNIQUE(student_id, academic_year_id)`. **Index:** `(school_id, academic_year_id)`.
Maintained automatically by student create/update (upsert into the current
year when one exists). No promotion logic yet — that only writes new rows here
and repoints `students`, never rewrites history.

## 25. documents

**Purpose:** metadata registry for every file in Supabase Storage.
Fields: `id`, `school_id`, `bucket TEXT`, `path TEXT` (tenant-prefixed per §9),
`original_name`, `mime TEXT`, `bytes INT`, `checksum TEXT NULL`,
`uploaded_by → users`, `is_deleted BOOL DEFAULT false`, timestamps.
`UNIQUE(bucket, path)`. **Index:** `(school_id, bucket, is_deleted)`.
Access control: readability derives from the *owning record's* permission
(student doc → same rule as student; receipt → same as fee) + signed URLs.

> Phase 3 note: the full `documents` registry lands with its module. Photos
> (student/teacher) already use private buckets `student-photos` /
> `teacher-photos` with tenant-prefixed paths and storage RLS (school members
> read own-school prefix; admins write), referenced via `photo_path`.

## 26. audit_logs — ✅ implemented (Phase 3)

**Purpose:** append-only trail. Fields: `id`, `school_id`, `actor_id → users NULL`
(NULL = system), `action TEXT` (`student.created`, `marks.updated`, …),
`entity TEXT`, `entity_id UUID NULL`, `created_at`, `metadata JSONB`.
**Index:** `(school_id, entity, entity_id, created_at DESC)`,
`(school_id, actor_id, created_at DESC)`. **No UPDATE/DELETE grants** to app
roles; marks/fee diffs carry `{before, after}` in `metadata`.

---

## RLS policy pattern (applied per tenant table)

> ✅ **Live for identity tables** (`schools`, `users`, `user_roles`) in
> migration `0002_auth_tenant.sql` via helpers `current_app_user_id()`,
> `current_school_id()`, `has_app_role()`, `is_school_admin()` (all
> `SECURITY DEFINER`, fixed `search_path`, derived from `auth.uid()` — never
> client-supplied ids).
> ✅ **Extended in Phase 3** (`0003_people_structure.sql`): same-school
> baseline for catalog tables; **link-scoped** reads for `students`,
> `student_parents`, `student_enrollments` via `teacher_can_access_section()`
> / `parent_can_access_student()`; admin-only writes for all Phase 3 tables;
> append-only `audit_logs`; tenant-consistency triggers
> (`assert_child_same_school`, `assert_link_same_school`) plus `school_id`
> immutability on every tenant table.

```sql
-- Read: same school, active user. (Parent/teacher link checks compose on top
-- in service queries AND dedicated RLS functions; never client-supplied ids.)
CREATE POLICY "<table>_select_same_school" ON public.<table>
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.is_active
            AND u.school_id = <table>.school_id)
);
-- INSERT/UPDATE/DELETE add WITH CHECK (school_id match) + role predicates
-- via is_school_admin() / teaches_section() / linked_parent() helpers.
```

`school_id` immutability trigger + `audit_logs` writer trigger ship in the same
migration as each table. Full DDL lands in `supabase/migrations/` during
roadmap steps 2–6; this document is the normative contract for it.

## ER overview (text)

```text
schools 1───* users 1───* user_roles
   │        │ 1───1 teachers ───* teacher_subjects *───1 subjects
   │        │ 1───1 parents ───* student_parents *───1 students
   │        └───* academic_years
   ├───* classes 1───* sections ───* students
   │      └───* class_subjects *─── subjects
   ├───* attendance_sessions 1───* attendance_records *─── students
   ├───* exams 1───* exam_subjects 1───* marks *─── students
   │                                    └── exam_schedules
   ├───* grading_systems 1───* grading_rules
   ├───* report_cards (exam × student snapshot + pdf → documents)
   ├───* timetable_slots (section × day × period)
   ├───* homework 1───* homework_attachments *─── documents
   ├───* notices 1───* notice_audience
   ├───* notifications *─── users
   ├───* fee_structures 1───* fee_components
   │      └───* student_fee_assignments 1───* fee_payment_records
   └───* documents (registry over Storage buckets) ───* audit_logs (trail)
```
