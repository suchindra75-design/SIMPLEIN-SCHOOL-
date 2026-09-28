-- SIMPLEIN SCHOOL ERP · Phase 3 live pgTAP RLS suite.
-- Convention notes in phase2_rls.sql. One transaction; rolls back at the end.

create extension if not exists pgtap;
begin;
select plan(28); -- 28 assertions

-- ---------------------- fixture: schools/users/roles ----------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f3030303-0303-4003-8303-0000000000a1','authenticated','authenticated','t3.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f3030303-0303-4003-8303-0000000000a2','authenticated','authenticated','t3.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f3030303-0303-4003-8303-0000000000a3','authenticated','authenticated','t3.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f3030303-0303-4003-8303-0000000000b1','authenticated','authenticated','t3.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f3030303-0303-4003-8303-0000000000b3','authenticated','authenticated','t3.parB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f3030303-0303-4003-8303-1000000000a1','Phase3 School A','phase3-school-a'),
  ('f3030303-0303-4003-8303-1000000000b1','Phase3 School B','phase3-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f3030303-0303-4003-8303-2000000000a1','f3030303-0303-4003-8303-0000000000a1','f3030303-0303-4003-8303-1000000000a1','phase3.adminA@phase.tests','Admin A'),
  ('f3030303-0303-4003-8303-2000000000a2','f3030303-0303-4003-8303-0000000000a2','f3030303-0303-4003-8303-1000000000a1','phase3.teacherA@phase.tests','Teacher A'),
  ('f3030303-0303-4003-8303-2000000000a3','f3030303-0303-4003-8303-0000000000a3','f3030303-0303-4003-8303-1000000000a1','phase3.parentA@phase.tests','Parent A'),
  ('f3030303-0303-4003-8303-2000000000b1','f3030303-0303-4003-8303-0000000000b1','f3030303-0303-4003-8303-1000000000b1','phase3.adminB@phase.tests','Admin B'),
  ('f3030303-0303-4003-8303-2000000000b3','f3030303-0303-4003-8303-0000000000b3','f3030303-0303-4003-8303-1000000000b1','phase3.parentB@phase.tests','Parent B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f3030303-0303-4003-8303-2000000000a1','SCHOOL_ADMIN'),
  ('f3030303-0303-4003-8303-2000000000a2','TEACHER'),
  ('f3030303-0303-4003-8303-2000000000a3','PARENT'),
  ('f3030303-0303-4003-8303-2000000000b1','SCHOOL_ADMIN'),
  ('f3030303-0303-4003-8303-2000000000b3','PARENT')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','Grade 6',6),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f3030303-0303-4003-8303-2000000000a2','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000a2','E1','Ravi','Ravi'),
  ('f3030303-0303-4003-8303-2000000000b2','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-2000000000b2','EB1','Far Teacher','Far Teacher')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','A','f3030303-0303-4003-8303-2000000000a2'),
  ('f3030303-0303-4003-8303-1000000000a2','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','B', null),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','A', null)
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','Mathematics','MATH'),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','Art','ART')
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status)
values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','301','Sonia','P3','Sonia P3','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','active'),
  ('f3030303-0303-4003-8303-1000000000a2','f3030303-0303-4003-8303-1000000000a1','302','Rahul','P3','Rahul P3','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a2','active'),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','B101','Far','B','Far Child','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f3030303-0303-4003-8303-2000000000a3','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000a3','Parent A'),
  ('f3030303-0303-4003-8303-2000000000b3','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-2000000000b3','Parent B')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000a3','mother', true),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-2000000000b3','father', true)
on conflict do nothing;

insert into public.teacher_subjects (school_id, teacher_id, subject_id, section_id) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000a2','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1')
on conflict do nothing;

insert into public.student_enrollments (id, school_id, student_id, academic_year_id, class_id, section_id) values
  ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1'),
  ('f3030303-0303-4003-8303-1000000000a2','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a2','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000a2'),
  ('f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000b1')
on conflict (id) do nothing;

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- Admin A tenant isolation: sees own school only; B invisible.
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a1"}';
select is((select count(*)::int from public.students where school_id='f3030303-0303-4003-8303-1000000000a1'),2,'admin A sees School A students');
select is((select count(*)::int from public.students where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B students');
select is((select count(*)::int from public.teachers where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B teachers');
select is((select count(*)::int from public.parents where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B parents');
select is((select count(*)::int from public.classes where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B classes');
select is((select count(*)::int from public.sections where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B sections');
select is((select count(*)::int from public.subjects where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B subjects');

-- Teacher scope: only assigned-section students (sec A only).
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a2"}';
select is((select count(*)::int from public.students where section_id='f3030303-0303-4003-8303-1000000000a1'),1,'teacher sees only own section students');
select is((select count(*)::int from public.students where section_id='f3030303-0303-4003-8303-1000000000a2'),0,'teacher sees no students from unassigned section');
select is((select count(*)::int from public.students where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'teacher sees no School B students');

-- Parent scope: only linked children.
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a3"}';
select is((select count(*)::int from public.students where id='f3030303-0303-4003-8303-1000000000a1'),1,'parent sees linked child');
select is((select count(*)::int from public.students where id='f3030303-0303-4003-8303-1000000000a2'),0,'parent sees zero unlinked children');
select is((select count(*)::int from public.students where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'parent sees zero School B students');

-- Enrollment visibility follows the same scope.
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a1"}';
select is((select count(*)::int from public.student_enrollments where school_id='f3030303-0303-4003-8303-1000000000a1'),2,'admin sees all School A enrollments');
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a2"}';
select is((select count(*)::int from public.student_enrollments where school_id='f3030303-0303-4003-8303-1000000000a1'),1,'teacher sees only own section enrollment');
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a3"}';
select is((select count(*)::int from public.student_enrollments where school_id='f3030303-0303-4003-8303-1000000000a1'),1,'parent sees only own child enrollment');

-- Cross-school write denial (update filtered to zero rows).
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a1"}';
update public.students set status='inactive' where id='f3030303-0303-4003-8303-1000000000b1';
select is((select count(*)::int from public.students where id='f3030303-0303-4003-8303-1000000000b1' and status='inactive'),0,'admin A update of School B student had zero effect');

-- ------------------------- trigger assertions (superuser) -------------------------
reset role;

select throws_ok(
  $$ insert into public.sections (id, school_id, class_id, name) values
      ('f3030303-0303-4003-8303-900000000091','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-1000000000b1','X') $$,
  'cross-tenant', 'trigger: section cannot reference School B class');

select throws_ok(
  $$ insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
      ('f3030303-0303-4003-8303-900000000092','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000b1','EX','X','X') $$,
  'cross-tenant', 'trigger: teacher cannot be linked to another school user');

select throws_ok(
  $$ insert into public.parents (id, school_id, user_id, full_name) values
      ('f3030303-0303-4003-8303-900000000093','f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000b3','X') $$,
  'cross-tenant', 'trigger: parent cannot be linked to another school user');

select throws_ok(
  $$ insert into public.students (id, school_id, admission_no, first_name, display_name, class_id, section_id) values
      ('f3030303-0303-4003-8303-900000000094','f3030303-0303-4003-8303-1000000000a1','900','X','X','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000a1') $$,
  'cross-tenant', 'trigger: student cannot reference School B class');

select throws_ok(
  $$ insert into public.student_parents (student_id, parent_id, relation) values
      ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000b3','guardian') $$,
  'cross-tenant', 'trigger: student-parent link cannot cross schools');

select throws_ok(
  $$ insert into public.teacher_subjects (school_id, teacher_id, subject_id, section_id) values
      ('f3030303-0303-4003-8303-1000000000a1','f3030303-0303-4003-8303-2000000000a2','f3030303-0303-4003-8303-1000000000b1','f3030303-0303-4003-8303-1000000000a1') $$,
  'cross-tenant', 'trigger: teacher assignment cannot reference School B subject');

select throws_ok(
  $$ update public.students set school_id='f3030303-0303-4003-8303-1000000000b1'
      where id='f3030303-0303-4003-8303-1000000000a1' $$,
  'school_id is immutable', 'trigger: school_id can never change on a student row');

-- RLS write boundary: teacher/parent cannot insert.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a2"}';
select throws_ok(
  $$ insert into public.students (school_id, admission_no, first_name, display_name) values
      ('f3030303-0303-4003-8303-1000000000a1','999','X','X') $$,
  '42501','teacher cannot insert a student (admin-only writes)');

set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a3"}';
select throws_ok(
  $$ insert into public.students (school_id, admission_no, first_name, display_name) values
      ('f3030303-0303-4003-8303-1000000000a1','998','X','X') $$,
  '42501','parent cannot insert a student (admin-only writes)');

-- Audit-log read scope: only admins of own school.
set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a2"}';
select is((select count(*)::int from public.audit_logs),0,'teacher sees zero audit rows (admin-only)');

set local "request.jwt.claims" = '{"sub":"f3030303-0303-4003-8303-0000000000a1"}';
select is((select count(*)::int from public.audit_logs where school_id='f3030303-0303-4003-8303-1000000000b1'),0,'admin A sees zero School B audit rows');

select * from finish();
rollback;
