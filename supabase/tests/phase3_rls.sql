-- SIMPLEIN SCHOOL ERP · Phase 3 RLS verification (LIVE DATABASE ONLY).
-- Run against a staging Supabase project AFTER applying migration 0003, as
-- authenticated users of two schools. No local Postgres tooling exists in
-- this environment, so these checks have NOT been executed here — the
-- equivalent server-boundary logic IS unit-tested in
-- lib/services/people-scope.test.ts (20 tests, passing).
--
-- Setup: school A with admin(A), teacher T (class teacher of sec7a +
-- Math assignee), parent P (linked to student s1 in sec7a, NOT to s2 in
-- sec7b); school B with an equivalent set. Authenticate each block with
-- that user's JWT (e.g. via the Supabase dashboard SQL editor "run as"
-- or a psql session with request.jwt.claims set by your harness).

-- A. Tenant isolation — cross-school reads return ZERO rows (never 403) -----
-- As admin(A):
-- SELECT id FROM public.students;            -- expect: only school-A rows
-- SELECT id FROM public.teachers;            -- expect: only school-A rows
-- SELECT id FROM public.parents;             -- expect: only school-A rows
-- SELECT id FROM public.classes;             -- expect: only school-A rows
-- SELECT id FROM public.sections;            -- expect: only school-A rows
-- SELECT id FROM public.subjects;            -- expect: only school-A rows
-- UPDATE public.students SET status='inactive'
--   WHERE id = '<school-B-student-id>';      -- expect: 0 rows affected

-- B. Teacher link scope -------------------------------------------------------
-- As teacher T (school A):
-- SELECT id FROM public.students;            -- expect: sec7a students ONLY
-- SELECT * FROM public.students WHERE id = '<s2-in-sec7b>';
--                                            -- expect: 0 rows
-- INSERT INTO public.students (school_id, admission_no, first_name, display_name)
--   VALUES ('<school-A-id>', 'X', 'X', 'X'); -- expect: RLS violation (admin-only writes)

-- C. Parent link scope ----------------------------------------------------------
-- As parent P (school A):
-- SELECT id FROM public.students;            -- expect: s1 ONLY
-- SELECT * FROM public.students WHERE id = '<s2>';  -- expect: 0 rows
-- SELECT * FROM public.teachers;             -- expect: T (teaches s1's section) ONLY

-- D. Tenant-consistency triggers --------------------------------------------------
-- As admin(A), all must RAISE:
-- INSERT INTO public.sections (school_id, class_id, name)
--   VALUES ('<A>', '<school-B-class-id>', 'X');                       -- cross-tenant reference
-- INSERT INTO public.student_parents (student_id, parent_id)
--   VALUES ('<A-student>', '<B-parent>');                             -- cross-tenant link
-- INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id, section_id)
--   VALUES ('<A>', '<A-teacher>', '<B-subject>', '<A-section>');       -- cross-tenant reference
-- UPDATE public.students SET school_id = '<B>' WHERE id = '<A-student>';
--                                                                     -- school_id is immutable
-- UPDATE public.users SET is_active = false
--   WHERE id = public.current_app_user_id();                          -- identity columns immutable

-- E. Admin write boundary ----------------------------------------------------------
-- As teacher T: INSERT/UPDATE/DELETE on teachers/parents/students/classes →
--   expect RLS violations (admin-only).
-- As admin(A): INSERT a student in A → 1 row; DELETE it → 1 row.

-- F. Audit log -----------------------------------------------------------------------
-- As teacher T: SELECT * FROM public.audit_logs;  -- expect: 0 rows (admin-only reads)
-- As admin(A): SELECT * FROM public.audit_logs;   -- expect: school-A rows only
-- As admin(A): DELETE FROM public.audit_logs;     -- expect: RLS violation (append-only)
