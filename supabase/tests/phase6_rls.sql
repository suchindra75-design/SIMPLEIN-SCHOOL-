-- SIMPLEIN SCHOOL ERP · Phase 6 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. marks / grading_systems / grading_rules
-- under test (migration 0006). One transaction; rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 17 +
-- throws_matching(…) 13 = 30. RLS checks run `set local role
-- authenticated` + SET request.jwt.claims; trigger assertions run as the
-- default connecting role (bypasses RLS) so the trigger itself is isolated
-- as the only possible failure cause. UPDATE denials assert zero-effect
-- (RLS USING filters updates like selects — no error). INSERT denials assert
-- the real layer that fires: the tenant trigger rejects RLS-invisible parents
-- as nonexistent (C2/C3), otherwise WITH CHECK raises 42501 (C4).
-- Sections A–G mirror the original phase-6 security checklist.

create extension if not exists pgtap;
begin;
select plan(30); -- 30 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f6060606-0606-4006-8606-0000000000a1','authenticated','authenticated','t6.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f6060606-0606-4006-8606-0000000000a2','authenticated','authenticated','t6.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f6060606-0606-4006-8606-0000000000a3','authenticated','authenticated','t6.teacherA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f6060606-0606-4006-8606-0000000000a4','authenticated','authenticated','t6.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f6060606-0606-4006-8606-0000000000b1','authenticated','authenticated','t6.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f6060606-0606-4006-8606-1000000000a1','Phase6 School A','phase6-school-a'),
  ('f6060606-0606-4006-8606-1000000000b1','Phase6 School B','phase6-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f6060606-0606-4006-8606-1100000000a1','f6060606-0606-4006-8606-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f6060606-0606-4006-8606-1100000000b1','f6060606-0606-4006-8606-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f6060606-0606-4006-8606-2000000000a1','f6060606-0606-4006-8606-0000000000a1','f6060606-0606-4006-8606-1000000000a1','phase6.adminA@phase.tests','Admin A'),
  ('f6060606-0606-4006-8606-2000000000a2','f6060606-0606-4006-8606-0000000000a2','f6060606-0606-4006-8606-1000000000a1','phase6.teacherA@phase.tests','Teacher A'),
  ('f6060606-0606-4006-8606-2000000000a3','f6060606-0606-4006-8606-0000000000a3','f6060606-0606-4006-8606-1000000000a1','phase6.teacherA2@phase.tests','Teacher A2'),
  ('f6060606-0606-4006-8606-2000000000a4','f6060606-0606-4006-8606-0000000000a4','f6060606-0606-4006-8606-1000000000a1','phase6.parentA@phase.tests','Parent A'),
  ('f6060606-0606-4006-8606-2000000000b1','f6060606-0606-4006-8606-0000000000b1','f6060606-0606-4006-8606-1000000000b1','phase6.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f6060606-0606-4006-8606-2000000000a1','SCHOOL_ADMIN'),
  ('f6060606-0606-4006-8606-2000000000a2','TEACHER'),
  ('f6060606-0606-4006-8606-2000000000a3','TEACHER'),
  ('f6060606-0606-4006-8606-2000000000a4','PARENT'),
  ('f6060606-0606-4006-8606-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

-- Grade 7 (Teacher A = class teacher of sec7a) + Grade 8 (unassigned) + School B.
insert into public.classes (id, school_id, name, order_index) values
  ('f6060606-0606-4006-8606-3000000000a1','f6060606-0606-4006-8606-1000000000a1','Grade 7',7),
  ('f6060606-0606-4006-8606-3000000000a2','f6060606-0606-4006-8606-1000000000a1','Grade 8',8),
  ('f6060606-0606-4006-8606-3000000000b1','f6060606-0606-4006-8606-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f6060606-0606-4006-8606-2000000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-2000000000a2','E1','Ravi','Ravi'),
  ('f6060606-0606-4006-8606-2000000000a3','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-2000000000a3','E2','Priya','Priya')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f6060606-0606-4006-8606-4000000000a1','f6060606-0606-4006-8606-1000000000a1','Mathematics','MATH'),
  ('f6060606-0606-4006-8606-4000000000a2','f6060606-0606-4006-8606-1000000000a1','English','ENG'),
  ('f6060606-0606-4006-8606-4000000000a3','f6060606-0606-4006-8606-1000000000a1','Science','SCI'),
  ('f6060606-0606-4006-8606-4000000000b1','f6060606-0606-4006-8606-1000000000b1','Art','ART')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f6060606-0606-4006-8606-5000000000a1','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-3000000000a1','A','f6060606-0606-4006-8606-2000000000a2'),
  ('f6060606-0606-4006-8606-5000000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-3000000000a2','X', null),
  ('f6060606-0606-4006-8606-5000000000b1','f6060606-0606-4006-8606-1000000000b1','f6060606-0606-4006-8606-3000000000b1','A', null)
on conflict (id) do nothing;

-- s1 + s2 in Grade 7/sec7a (s1 linked to Parent A, s2 not); s3 in Grade 8.
insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f6060606-0606-4006-8606-6000000000a1','f6060606-0606-4006-8606-1000000000a1','601','Sonia','P6','Sonia P6','f6060606-0606-4006-8606-3000000000a1','f6060606-0606-4006-8606-5000000000a1','active'),
  ('f6060606-0606-4006-8606-6000000000a2','f6060606-0606-4006-8606-1000000000a1','602','Rahul','P6','Rahul P6','f6060606-0606-4006-8606-3000000000a1','f6060606-0606-4006-8606-5000000000a1','active'),
  ('f6060606-0606-4006-8606-6000000000a3','f6060606-0606-4006-8606-1000000000a1','603','Meera','P6','Meera P6','f6060606-0606-4006-8606-3000000000a2','f6060606-0606-4006-8606-5000000000a2','active'),
  ('f6060606-0606-4006-8606-6000000000b1','f6060606-0606-4006-8606-1000000000b1','B601','Far','B','Far Child','f6060606-0606-4006-8606-3000000000b1','f6060606-0606-4006-8606-5000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f6060606-0606-4006-8606-2000000000a4','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-2000000000a4','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f6060606-0606-4006-8606-6000000000a1','f6060606-0606-4006-8606-2000000000a4','mother', true)
on conflict do nothing;

-- Teacher A2 = Mathematics assignee in sec7a only (NOT class teacher).
insert into public.teacher_subjects (school_id, teacher_id, subject_id, section_id) values
  ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-2000000000a3','f6060606-0606-4006-8606-4000000000a1','f6060606-0606-4006-8606-5000000000a1')
on conflict do nothing;

insert into public.student_enrollments (id, school_id, student_id, academic_year_id, class_id, section_id, status) values
  ('f6060606-0606-4006-8606-7000000000a1','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-6000000000a1','f6060606-0606-4006-8606-1100000000a1','f6060606-0606-4006-8606-3000000000a1','f6060606-0606-4006-8606-5000000000a1','enrolled'),
  ('f6060606-0606-4006-8606-7000000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-6000000000a2','f6060606-0606-4006-8606-1100000000a1','f6060606-0606-4006-8606-3000000000a1','f6060606-0606-4006-8606-5000000000a1','enrolled'),
  ('f6060606-0606-4006-8606-7000000000a3','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-6000000000a3','f6060606-0606-4006-8606-1100000000a1','f6060606-0606-4006-8606-3000000000a2','f6060606-0606-4006-8606-5000000000a2','enrolled'),
  ('f6060606-0606-4006-8606-7000000000b1','f6060606-0606-4006-8606-1000000000b1','f6060606-0606-4006-8606-6000000000b1','f6060606-0606-4006-8606-1100000000b1','f6060606-0606-4006-8606-3000000000b1','f6060606-0606-4006-8606-5000000000b1','enrolled')
on conflict (id) do nothing;

insert into public.exams (id, school_id, academic_year_id, class_id, name, starts_on, ends_on) values
  ('f6060606-0606-4006-8606-8000000000a1','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-1100000000a1','f6060606-0606-4006-8606-3000000000a1','Unit Test 1','2026-09-01','2026-09-30'),
  ('f6060606-0606-4006-8606-8000000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-1100000000a1','f6060606-0606-4006-8606-3000000000a2','Half-Yearly','2026-11-01','2026-11-30'),
  ('f6060606-0606-4006-8606-8000000000b1','f6060606-0606-4006-8606-1000000000b1','f6060606-0606-4006-8606-1100000000b1','f6060606-0606-4006-8606-3000000000b1','Final','2027-02-01','2027-02-28')
on conflict (id) do nothing;

-- es7m published + unlocked; es7e unpublished + unlocked; es7s LOCKED.
insert into public.exam_subjects (id, school_id, exam_id, subject_id, max_marks, passing_marks, exam_date, is_locked, is_published) values
  ('f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8000000000a1','f6060606-0606-4006-8606-4000000000a1',100,33,'2026-09-10', false, true),
  ('f6060606-0606-4006-8606-8100000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8000000000a1','f6060606-0606-4006-8606-4000000000a2',100,33,'2026-09-12', false, false),
  ('f6060606-0606-4006-8606-8100000000a3','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8000000000a1','f6060606-0606-4006-8606-4000000000a3',50,17,'2026-09-15', true, false),
  ('f6060606-0606-4006-8606-8100000000a4','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8000000000a2','f6060606-0606-4006-8606-4000000000a1',100,33,'2026-11-05', false, false),
  ('f6060606-0606-4006-8606-8100000000b1','f6060606-0606-4006-8606-1000000000b1','f6060606-0606-4006-8606-8000000000b1','f6060606-0606-4006-8606-4000000000b1',50,17,'2027-02-05', false, false)
on conflict (id) do nothing;

insert into public.marks (id, school_id, exam_subject_id, student_id, marks_obtained) values
  ('f6060606-0606-4006-8606-8200000000a1','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-6000000000a1',80),
  ('f6060606-0606-4006-8606-8200000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a2','f6060606-0606-4006-8606-6000000000a1',70),
  ('f6060606-0606-4006-8606-8200000000a3','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a3','f6060606-0606-4006-8606-6000000000a1',40),
  ('f6060606-0606-4006-8606-8200000000a4','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-6000000000a2',60),
  ('f6060606-0606-4006-8606-8200000000a5','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a4','f6060606-0606-4006-8606-6000000000a3',55),
  ('f6060606-0606-4006-8606-8200000000b1','f6060606-0606-4006-8606-1000000000b1','f6060606-0606-4006-8606-8100000000b1','f6060606-0606-4006-8606-6000000000b1',30)
on conflict (id) do nothing;

insert into public.grading_systems (id, school_id, name, is_default) values
  ('f6060606-0606-4006-8606-8300000000a1','f6060606-0606-4006-8606-1000000000a1','Phase6 Default', true),
  ('f6060606-0606-4006-8606-8300000000a2','f6060606-0606-4006-8606-1000000000a1','Phase6 Alt', false),
  ('f6060606-0606-4006-8606-8300000000b1','f6060606-0606-4006-8606-1000000000b1','Phase6 B', true)
on conflict (id) do nothing;

insert into public.grading_rules (id, school_id, grading_system_id, min_percentage, max_percentage, grade) values
  ('f6060606-0606-4006-8606-8400000000a1','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8300000000a1',0,39.99,'F'),
  ('f6060606-0606-4006-8606-8400000000a2','f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8300000000a1',40,100,'P')
on conflict (id) do nothing;

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Tenant isolation — School A marks: A→A allowed, A→B denied.
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a1"}';
select is((select count(*)::int from public.marks where school_id='f6060606-0606-4006-8606-1000000000a1'),5,'A: admin A sees all five School A marks');
select is((select count(*)::int from public.marks where school_id='f6060606-0606-4006-8606-1000000000b1'),0,'A: admin A sees zero School B marks');
select is((select count(*)::int from public.grading_systems where school_id='f6060606-0606-4006-8606-1000000000a1'),2,'A: admin A sees own grading systems');
select is((select count(*)::int from public.grading_systems where school_id='f6060606-0606-4006-8606-1000000000b1'),0,'A: admin A sees zero School B grading systems');

-- B. Teacher scope (class c7; T = class teacher → all subjects; T2 = Math only).
-- RLS is class-level: any section link in the exam class grants the class.
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a2"}';
select is((select count(*)::int from public.marks where exam_subject_id in ('f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-8100000000a2','f6060606-0606-4006-8606-8100000000a3')),4,'B: teacher T sees all Grade 7 marks');
select is((select count(*)::int from public.marks where exam_subject_id='f6060606-0606-4006-8606-8100000000a4'),0,'B: teacher T sees zero Grade 8 marks');
select is((select count(*)::int from public.marks where school_id='f6060606-0606-4006-8606-1000000000b1'),0,'B: teacher T sees zero School B marks');
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a3"}';
select is((select count(*)::int from public.marks where exam_subject_id in ('f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-8100000000a2','f6060606-0606-4006-8606-8100000000a3')),4,'B: teacher T2 (Math assignee) sees Grade 7 marks');
select is((select count(*)::int from public.marks where exam_subject_id='f6060606-0606-4006-8606-8100000000a4'),0,'B: teacher T2 sees zero Grade 8 marks');

-- C. Teacher write boundary: unlocked own-class insert allowed; out-of-scope denied.
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a2"}';
insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
  ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a2','f6060606-0606-4006-8606-6000000000a2',75);
select is((select count(*)::int from public.marks where exam_subject_id='f6060606-0606-4006-8606-8100000000a2' and student_id='f6060606-0606-4006-8606-6000000000a2'),1,'C: teacher T inserts an unlocked own-class mark');
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a4','f6060606-0606-4006-8606-6000000000a3',50) $$,
  'does not exist','C: teacher T cannot insert Grade 8 marks (subject invisible, denied)');
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000b1','f6060606-0606-4006-8606-8100000000b1','f6060606-0606-4006-8606-6000000000b1',20) $$,
  'does not exist','C: teacher T cannot insert School B marks (subject invisible, denied)');
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a4"}';
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-6000000000a1',90) $$,
  'row-level security policy','C: parent cannot insert marks (read-only)');

-- D. Locked-state enforcement at the DB (teacher edit has zero effect, no error).
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a2"}';
update public.marks set marks_obtained = 41 where id = 'f6060606-0606-4006-8606-8200000000a3';
select is((select count(*)::int from public.marks where id='f6060606-0606-4006-8606-8200000000a3' and marks_obtained=40),1,'D: locked subject rejects teacher edits (value unchanged)');

-- E. Parent scope (linked to s1; PUBLISHED only).
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a4"}';
select is((select count(*)::int from public.marks),1,'E: parent sees only the one published linked mark');
select is((select count(*)::int from public.marks where exam_subject_id='f6060606-0606-4006-8606-8100000000a2'),0,'E: parent sees zero unpublished marks');
select is((select count(*)::int from public.marks where student_id='f6060606-0606-4006-8606-6000000000a2'),0,'E: parent sees zero unlinked-child marks');
select is((select count(*)::int from public.marks where school_id='f6060606-0606-4006-8606-1000000000b1'),0,'E: parent sees zero School B marks');

-- F. Modification authorization (UPDATE denials filter to zero rows, no error).
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a2"}';
update public.grading_systems set name = 'Hacked' where id = 'f6060606-0606-4006-8606-8300000000a1';
select is((select count(*)::int from public.grading_systems where id='f6060606-0606-4006-8606-8300000000a1' and name='Phase6 Default'),1,'F: teacher cannot rename grading system (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a4"}';
update public.marks set marks_obtained = 0 where id = 'f6060606-0606-4006-8606-8200000000a1';
select is((select count(*)::int from public.marks where id='f6060606-0606-4006-8606-8200000000a1' and marks_obtained=80),1,'F: parent cannot modify marks (read-only)');

-- ------------------------- trigger assertions (superuser) -------------------------
reset role;

select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-6000000000b1',50) $$,
  'cross-tenant','G: cross-tenant student reference rejected');
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000b1','f6060606-0606-4006-8606-6000000000a1',20) $$,
  'cross-tenant','G: cross-tenant exam-subject reference rejected');
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a2','f6060606-0606-4006-8606-6000000000a3',150) $$,
  'exceeds max_marks','G: marks above max_marks rejected');
-- G4/G6 surface constraint (not trigger) errors, so they run with an admin
-- session: RLS WITH CHECK must pass for the CHECK/unique error to surface
-- (as the connecting role, RLS would reject first with its own violation).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f6060606-0606-4006-8606-0000000000a1"}';
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a3','f6060606-0606-4006-8606-6000000000a2',-5) $$,
  'violates check constraint','G: negative marks rejected (CHECK)');
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-6000000000a1',80) $$,
  'duplicate key value','G: duplicate mark for the same exam-subject/student prevented');
reset role;
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8100000000a1','f6060606-0606-4006-8606-6000000000a3',50) $$,
  'not enrolled','G: student outside the exam class rejected');
select throws_matching(
  $$ update public.marks set school_id='f6060606-0606-4006-8606-1000000000b1'
      where id='f6060606-0606-4006-8606-8200000000a1' $$,
  'school_id is immutable','G: school_id can never change on a mark row');
select throws_matching(
  $$ insert into public.grading_rules (school_id, grading_system_id, min_percentage, max_percentage, grade) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8300000000a1',30,50,'X') $$,
  'overlaps','G: overlapping grading band rejected');
select throws_matching(
  $$ insert into public.grading_rules (school_id, grading_system_id, min_percentage, max_percentage, grade) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8300000000b1',0,10,'X') $$,
  'cross-tenant','G: grading rule cannot reference another school system');
select throws_matching(
  $$ insert into public.grading_rules (school_id, grading_system_id, min_percentage, max_percentage, grade) values
      ('f6060606-0606-4006-8606-1000000000a1','f6060606-0606-4006-8606-8300000000a2',80,70,'X') $$,
  'max must be >= min','G: inverted grading band rejected');

select * from finish();
rollback;
