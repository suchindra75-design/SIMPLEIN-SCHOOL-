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

## 15. attendance_sessions + attendance_records

**Purpose:** daily attendance with auditable grain.
**`attendance_sessions`:** one row per section per day. `id`, `school_id`,
`section_id → sections`, `academic_year_id`, `date DATE`, `marked_by → users`,
`status (DRAFT|SUBMITTED)`, `version INT`, timestamps.
`UNIQUE(section_id, date)`. **Index:** `(school_id, section_id, date DESC)`.
**`attendance_records`:** one row per student per session.
`id`, `school_id`, `session_id → attendance_sessions ON DELETE CASCADE`,
`student_id → students`, `status (PRESENT|ABSENT|LEAVE)`, `remark`,
`updated_by → users`, timestamps. `UNIQUE(session_id, student_id)`.
**Index:** `(school_id, student_id, session_id)` (student history); percentage =
`present / (present+absent+leave)` view over joined sessions (LEAVE excluded from
denominator per school policy flag — configurable, default excluded).
Edits bump session `version` + write `audit_logs` with before/after.

## 16. exams · exam_subjects · exam_schedules

**`exams`:** exam event (Mid-Term). `id`, `school_id`, `academic_year_id`,
`name`, `class_id → classes`, `starts_on/ends_on DATE`, `status
(DRAFT|SCHEDULED|ONGOING|COMPLETED)`, timestamps. **Index:** `(school_id, class_id, starts_on)`.
**`exam_subjects`:** subject instance within an exam — owns marks config + lock.
`id`, `school_id`, `exam_id → exams ON DELETE CASCADE`, `subject_id → subjects`,
`max_marks NUMERIC`, `passing_marks NUMERIC`, `exam_date DATE`, `start_time/end_time TIME`,
`is_locked BOOL DEFAULT false`, `is_published BOOL DEFAULT false`, timestamps.
`UNIQUE(exam_id, subject_id)`; `CHECK (passing_marks <= max_marks)`.
**`exam_schedules`** (room/invigilator detail; kept separate so date changes don't
touch mark config): `id`, `school_id`, `exam_subject_id → exam_subjects ON DELETE CASCADE`,
`room`, `invigilator_id → teachers NULL`, timestamps.

## 17. marks

**Purpose:** one score per student per exam-subject.
Fields: `id`, `school_id`, `exam_subject_id → exam_subjects`,
`student_id → students`, `marks_obtained NUMERIC`, `grade TEXT` (derived, stored for
report snapshot), `is_absent BOOL`, `entered_by → users`, `version INT`,
timestamps. `UNIQUE(exam_subject_id, student_id)`.
**Constraints:** `CHECK (marks_obtained <= (SELECT max_marks …))` enforced in
service + trigger; writes rejected when parent `exam_subjects.is_locked`;
`version` optimistic-locking on edit. **Index:** `(school_id, exam_subject_id)`,
`(school_id, student_id)`.
Edits store `{before, after}` in `audit_logs.metadata`.

## 18. grading_systems + grading_rules

**Purpose:** configurable per-school grading (percentage bands and/or CGPA).
**`grading_systems`:** `id`, `school_id`, `name` (e.g. `CBSE-style`), `is_default BOOL`,
timestamps. Partial unique `(school_id) WHERE is_default`.
**`grading_rules`:** `id`, `school_id`, `grading_system_id → grading_systems ON DELETE CASCADE`,
`min_percentage NUMERIC`, `max_percentage NUMERIC`, `grade TEXT`, `grade_point NUMERIC NULL`,
`remark_template TEXT NULL`, timestamps. Non-overlapping bands enforced by trigger.
Grade computation is a pure function (`lib/services/grades/`) — unit-tested with
boundary fixtures — shared by marks entry preview and report cards (no duplicated logic).

## 19. report_cards

**Purpose:** generated result snapshot per student per exam (immutable once published).
Fields: `id`, `school_id`, `exam_id → exams`, `student_id → students`,
`grading_system_id → grading_systems`, `total_obtained/max NUMERIC`,
`percentage NUMERIC`, `cgpa NUMERIC NULL`, `overall_grade`, `attendance_percentage NUMERIC NULL`,
`remarks`, `pdf_document_id → documents NULL`, `status (DRAFT|PUBLISHED)`,
`published_by → users NULL`, `published_at NULL`, timestamps.
`UNIQUE(exam_id, student_id)`. Published rows immutable (trigger rejects UPDATE
except status-transition bookkeeping, which itself is audited).

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
