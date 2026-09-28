-- SIMPLEIN SCHOOL ERP · Phase 5 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. exams / exam_subjects / exam_schedules under test.
-- Assertion calls (count must match the plan below): is(…) 14 read/scope checks
-- + throws_ok(…) 4 + throws_matching(…) 4. Time-range rules are enforced at the
-- SERVICE layer for exam subjects (lib/validation/exams.ts) and are not repeated
-- here because no DB CHECK exists by design.

create extension if not exists pgtap;
begin;
select plan(20); -- 20 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f5050505-0505-4005-8505-0000000000a1','authenticated','authenticated','t5.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f5050505-0505-4005-8505-0000000000a2','authenticated','authenticated','t5.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f5050505-0505-4005-8505-0000000000a3','authenticated','authenticated','t5.teacherA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f5050505-0505-4005-8505-0000000000a4','authenticated','authenticated','t5.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f5050505-0505-4005-8505-0000000000b1','authenticated','authenticated','t5.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f5050505-0505-4005-8505-1000000000a1','Phase5 School A','phase5-school-a'),
  ('f5050505-0505-4005-8505-1000000000b1','Phase5 School B','phase5-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f5050505-0505-4005-8505-2000000000a1','f5050505-0505-4005-8505-0000000000a1','f5050505-0505-4005-8505-1000000000a1','phase5.adminA@phase.tests','Admin A'),
  ('f5050505-0505-4005-8505-2000000000a2','f5050505-0505-4005-8505-0000000000a2','f5050505-0505-4005-8505-1000000000a1','phase5.teacherA@phase.tests','Teacher A'),
  ('f5050505-0505-4005-8505-2000000000a3','f5050505-0505-4005-8505-0000000000a3','f5050505-0505-4005-8505-1000000000a1','phase5.teacherA2@phase.tests','Teacher A2'),
  ('f5050505-0505-4005-8505-2000000000a4','f5050505-0505-4005-8505-0000000000a4','f5050505-0505-4005-8505-1000000000a1','phase5.parentA@phase.tests','Parent A'),
  ('f5050505-0505-4005-8505-2000000000b1','f5050505-0505-4005-8505-0000000000b1','f5050505-0505-4005-8505-1000000000b1','phase5.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f5050505-0505-4005-8505-2000000000a1','SCHOOL_ADMIN'),
  ('f5050505-0505-4005-8505-2000000000a2','TEACHER'),
  ('f5050505-0505-4005-8505-2000000000a3','TEACHER'),
  ('f5050505-0505-4005-8505-2000000000a4','PARENT'),
  ('f5050505-0505-4005-8505-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','Grade 7',7),
  ('f5050505-0505-4005-8505-1000000000a2','f5050505-0505-4005-8505-1000000000a1','Grade 8',8),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f5050505-0505-4005-8505-2000000000a2','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-2000000000a2','E1','Ravi','Ravi'),
  ('f5050505-0505-4005-8505-2000000000a3','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-2000000000a3','E2','Priya','Priya')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','Mathematics','MATH'),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','Art','ART')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','A','f5050505-0505-4005-8505-2000000000a2'),
  ('f5050505-0505-4005-8505-1000000000a2','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a2','X','f5050505-0505-4005-8505-2000000000a3'),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','A', null)
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','501','Sonia','P5','Sonia P5','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','active'),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','B501','Far','B','Far Child','f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f5050505-0505-4005-8505-2000000000a4','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-2000000000a4','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-2000000000a4','mother', true)
on conflict do nothing;

insert into public.student_enrollments (id, school_id, student_id, academic_year_id, class_id, section_id) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1')
on conflict (id) do nothing;

-- Exams: Grade 7 (Teacher A owns sec A of Grade 7) + Grade 8 (Teacher A2) + School B.
insert into public.exams (id, school_id, academic_year_id, class_id, name, starts_on, ends_on) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','Unit Test 1','2026-09-01','2026-09-30'),
  ('f5050505-0505-4005-8505-1000000000a2','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a2','Half-Yearly','2026-11-01','2026-11-30'),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','Final','2027-02-01','2027-02-28')
on conflict (id) do nothing;

insert into public.exam_subjects (id, school_id, exam_id, subject_id, max_marks, passing_marks, exam_date) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1',100,33,'2026-09-10'),
  ('f5050505-0505-4005-8505-1000000000a2','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a2','f5050505-0505-4005-8505-1000000000a1',100,33,'2026-11-05'),
  ('f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1','f5050505-0505-4005-8505-1000000000b1',50,17,'2027-02-05')
on conflict (id) do nothing;

insert into public.exam_schedules (id, school_id, exam_subject_id, room, invigilator_id) values
  ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','R1','f5050505-0505-4005-8505-2000000000a2')
on conflict (id) do nothing;

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- Admin A: sees school-A exams only.
set local "request.jwt.claims" = '{"sub":"f5050505-0505-4005-8505-0000000000a1"}';
select is((select count(*)::int from public.exams where school_id='f5050505-0505-4005-8505-1000000000a1'),2,'admin A sees both School A exams');
select is((select count(*)::int from public.exams where school_id='f5050505-0505-4005-8505-1000000000b1'),0,'admin A sees zero School B exams');
select is((select count(*)::int from public.exam_subjects where school_id='f5050505-0505-4005-8505-1000000000b1'),0,'admin A sees zero School B exam subjects');
select is((select count(*)::int from public.exam_schedules where school_id='f5050505-0505-4005-8505-1000000000b1'),0,'admin A sees zero School B schedules');

-- Teacher scope: Grade 7 (Teacher A = class teacher of sec A) visible; Grade 8 hidden.
set local "request.jwt.claims" = '{"sub":"f5050505-0505-4005-8505-0000000000a2"}';
select is((select count(*)::int from public.exams where id='f5050505-0505-4005-8505-1000000000a1'),1,'teacher sees assigned-class exam');
select is((select count(*)::int from public.exams where id='f5050505-0505-4005-8505-1000000000a2'),0,'teacher cannot see unrelated-class exam (Grade 8)');
select is((select count(*)::int from public.exams where school_id='f5050505-0505-4005-8505-1000000000b1'),0,'teacher sees zero School B exams');
select is((select count(*)::int from public.exam_subjects where exam_id='f5050505-0505-4005-8505-1000000000a2'),0,'teacher cannot see exam subjects of unrelated exams');

-- Teacher A2 (assigned Grade 8) sees it.
set local "request.jwt.claims" = '{"sub":"f5050505-0505-4005-8505-0000000000a3"}';
select is((select count(*)::int from public.exams where id='f5050505-0505-4005-8505-1000000000a2'),1,'teacher 2 sees their assigned exam (Grade 8)');

-- Parent scope: linked child's class exams only (parent of s1 in Grade 7).
set local "request.jwt.claims" = '{"sub":"f5050505-0505-4005-8505-0000000000a4"}';
select is((select count(*)::int from public.exams where id='f5050505-0505-4005-8505-1000000000a1'),1,'parent sees own child class exam');
select is((select count(*)::int from public.exams where id='f5050505-0505-4005-8505-1000000000a2'),0,'parent cannot see unrelated-class exam');
select is((select count(*)::int from public.exams where school_id='f5050505-0505-4005-8505-1000000000b1'),0,'parent sees zero School B exams');

-- Modification boundary: teacher/parent cannot create exams.
set local "request.jwt.claims" = '{"sub":"f5050505-0505-4005-8505-0000000000a2"}';
select throws_ok(
  $$ insert into public.exams (school_id, academic_year_id, class_id, name, starts_on, ends_on) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','X','2026-10-01','2026-10-31') $$,
  '42501','teacher cannot create an exam (admin-only writes)');

set local "request.jwt.claims" = '{"sub":"f5050505-0505-4005-8505-0000000000a4"}';
select throws_ok(
  $$ insert into public.exams (school_id, academic_year_id, class_id, name, starts_on, ends_on) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','X','2026-10-01','2026-10-31') $$,
  '42501','parent cannot create an exam (admin-only writes)');

-- ------------------------- trigger assertions (superuser) -------------------------
reset role;

select throws_matching(
  $$ insert into public.exams (school_id, academic_year_id, class_id, name, starts_on, ends_on) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000b1','X','2026-10-01','2026-10-31') $$,
  'cross-tenant reference','trigger: exam cannot reference School B class');

select throws_matching(
  $$ insert into public.exam_subjects (school_id, exam_id, subject_id, max_marks, passing_marks) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000b1',100,33) $$,
  'cross-tenant reference','trigger: exam subject cannot reference School B subject');

select throws_matching(
  $$ insert into public.exam_schedules (school_id, exam_subject_id, invigilator_id) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-2000000000b1') $$,
  'cross-tenant reference','trigger: schedule cannot reference School B invigilator');

select throws_ok(
  $$ insert into public.exams (school_id, academic_year_id, class_id, name, starts_on, ends_on) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','Unit Test 1','2026-10-01','2026-10-31') $$,
  '23505','duplicate exam name for the same class/year prevented');

select throws_ok(
  $$ insert into public.exam_subjects (school_id, exam_id, subject_id, max_marks, passing_marks) values
      ('f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1','f5050505-0505-4005-8505-1000000000a1',100,101) $$,
  '23514','CHECK violation: passing_marks may not exceed max_marks');

select throws_matching(
  $$ update public.exams set school_id='f5050505-0505-4005-8505-1000000000b1'
      where id='f5050505-0505-4005-8505-1000000000a1' $$,
  'school_id is immutable','trigger: school_id can never change on exams');

select * from finish();
rollback;
