-- SIMPLEIN SCHOOL ERP · Phase 4 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. Attendance sessions/records under test.

create extension if not exists pgtap;
begin;
select plan(18); -- 18 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f4040404-0404-4004-8404-0000000000a1','authenticated','authenticated','t4.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f4040404-0404-4004-8404-0000000000a2','authenticated','authenticated','t4.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f4040404-0404-4004-8404-0000000000a3','authenticated','authenticated','t4.teacherA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f4040404-0404-4004-8404-0000000000a4','authenticated','authenticated','t4.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f4040404-0404-4004-8404-0000000000b1','authenticated','authenticated','t4.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f4040404-0404-4004-8404-1000000000a1','Phase4 School A','phase4-school-a'),
  ('f4040404-0404-4004-8404-1000000000b1','Phase4 School B','phase4-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f4040404-0404-4004-8404-2000000000a1','f4040404-0404-4004-8404-0000000000a1','f4040404-0404-4004-8404-1000000000a1','phase4.adminA@phase.tests','Admin A'),
  ('f4040404-0404-4004-8404-2000000000a2','f4040404-0404-4004-8404-0000000000a2','f4040404-0404-4004-8404-1000000000a1','phase4.teacherA@phase.tests','Teacher A'),
  ('f4040404-0404-4004-8404-2000000000a3','f4040404-0404-4004-8404-0000000000a3','f4040404-0404-4004-8404-1000000000a1','phase4.teacherA2@phase.tests','Teacher A2'),
  ('f4040404-0404-4004-8404-2000000000a4','f4040404-0404-4004-8404-0000000000a4','f4040404-0404-4004-8404-1000000000a1','phase4.parentA@phase.tests','Parent A'),
  ('f4040404-0404-4004-8404-2000000000b1','f4040404-0404-4004-8404-0000000000b1','f4040404-0404-4004-8404-1000000000b1','phase4.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f4040404-0404-4004-8404-2000000000a1','SCHOOL_ADMIN'),
  ('f4040404-0404-4004-8404-2000000000a2','TEACHER'),
  ('f4040404-0404-4004-8404-2000000000a3','TEACHER'),
  ('f4040404-0404-4004-8404-2000000000a4','PARENT'),
  ('f4040404-0404-4004-8404-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','Grade 7',7),
  ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f4040404-0404-4004-8404-2000000000a2','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-2000000000a2','E1','Ravi','Ravi'),
  ('f4040404-0404-4004-8404-2000000000a3','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-2000000000a3','E2','Priya','Priya')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','A','f4040404-0404-4004-8404-2000000000a2'),
  ('f4040404-0404-4004-8404-1000000000a2','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','B', null),
  ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','A', null)
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','Mathematics','MATH')
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','401','Sonia','P4','Sonia P4','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','active'),
  ('f4040404-0404-4004-8404-1000000000a2','f4040404-0404-4004-8404-1000000000a1','402','Rahul','P4','Rahul P4','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a2','active'),
  ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','B401','Far','B','Far Child','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f4040404-0404-4004-8404-2000000000a4','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-2000000000a4','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-2000000000a4','mother', true)
on conflict do nothing;

insert into public.student_enrollments (id, school_id, student_id, academic_year_id, class_id, section_id) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1')
on conflict (id) do nothing;

insert into public.attendance_sessions (id, school_id, academic_year_id, section_id, attendance_date, status) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','2026-09-24','SUBMITTED'),
  ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','2026-09-24','SUBMITTED')
on conflict (id) do nothing;

insert into public.attendance_records (id, school_id, attendance_session_id, student_id, status) values
  ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','PRESENT'),
  ('f4040404-0404-4004-8404-1000000000a2','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a2','ABSENT'),
  ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','PRESENT')
on conflict (id) do nothing;

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- Admin A visibility.
set local "request.jwt.claims" = '{"sub":"f4040404-0404-4004-8404-0000000000a1"}';
select is((select count(*)::int from public.attendance_sessions where school_id='f4040404-0404-4004-8404-1000000000a1'),1,'admin sees only school-A sessions');
select is((select count(*)::int from public.attendance_sessions where school_id='f4040404-0404-4004-8404-1000000000b1'),0,'admin sees zero School B sessions');
select is((select count(*)::int from public.attendance_records where school_id='f4040404-0404-4004-8404-1000000000b1'),0,'admin sees zero School B attendance records');

-- Teacher scope: only assigned section (sec A — class teacher).
set local "request.jwt.claims" = '{"sub":"f4040404-0404-4004-8404-0000000000a2"}';
select is((select count(*)::int from public.attendance_sessions where school_id='f4040404-0404-4004-8404-1000000000a1'),1,'teacher sees own-section session');

-- Second teacher (Priya) has NO assignment → sees nothing from section A.
set local "request.jwt.claims" = '{"sub":"f4040404-0404-4004-8404-0000000000a3"}';
select is((select count(*)::int from public.attendance_sessions where school_id='f4040404-0404-4004-8404-1000000000a1'),0,'unassigned teacher sees zero sessions');

-- Teacher write denial on an unassigned section.
select throws_ok(
  $$ insert into public.attendance_sessions (school_id, academic_year_id, section_id, attendance_date) values
      ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a2','2026-09-25') $$,
  '42501','teacher cannot create a session for an unassigned section');

-- Cross-school session write.
select throws_ok(
  $$ insert into public.attendance_sessions (school_id, academic_year_id, section_id, attendance_date) values
      ('f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','f4040404-0404-4004-8404-1000000000b1','2026-09-25') $$,
  '42501','teacher cannot create a session in School B');

-- Attendance record edits follow section scope.
update public.attendance_records set status='PRESENT' where id='f4040404-0404-4004-8404-1000000000a2';
select is((select count(*)::int from public.attendance_records where id='f4040404-0404-4004-8404-1000000000a2' and status='PRESENT'),0,'unassigned teacher cannot modify attendance');

-- ---------------------------- parent scope ----------------------------
set local "request.jwt.claims" = '{"sub":"f4040404-0404-4004-8404-0000000000a4"}';
select is((select count(*)::int from public.attendance_records where student_id='f4040404-0404-4004-8404-1000000000a1'),1,'parent sees linked child attendance');
select is((select count(*)::int from public.attendance_records where student_id='f4040404-0404-4004-8404-1000000000a2'),0,'parent sees zero unlinked-child records');
select is((select count(*)::int from public.attendance_records where school_id='f4040404-0404-4004-8404-1000000000b1'),0,'parent sees zero School B records');

-- Parent is read-only.
select throws_ok(
  $$ insert into public.attendance_records (school_id, attendance_session_id, student_id, status) values
      ('f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','PRESENT') $$,
  '42501','parent cannot insert attendance (read-only)');

-- ------------------------- trigger assertions (superuser) -------------------------
reset role;

select throws_ok(
  $$ insert into public.attendance_sessions (id, school_id, academic_year_id, section_id, attendance_date) values
      ('f4040404-0404-4004-8404-900000000091','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000b1','2026-09-30') $$,
  'cross-tenant','trigger: session cannot reference School B section');

select throws_ok(
  $$ insert into public.attendance_records (id, school_id, attendance_session_id, student_id, status) values
      ('f4040404-0404-4004-8404-900000000092','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000b1','LEAVE') $$,
  'cross-tenant','trigger: attendance record cannot reference School B student');

select throws_ok(
  $$ insert into public.attendance_sessions (id, school_id, academic_year_id, section_id, attendance_date) values
      ('f4040404-0404-4004-8404-900000000093','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','2026-09-24') $$,
  '23505','duplicate attendance session for same section/date prevented');

select throws_ok(
  $$ insert into public.attendance_records (id, school_id, attendance_session_id, student_id, status) values
      ('f4040404-0404-4004-8404-900000000094','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','LATE') $$,
  '22P02','invalid attendance status rejected (enum)');

select throws_ok(
  $$ update public.attendance_sessions set school_id='f4040404-0404-4004-8404-1000000000b1'
      where id='f4040404-0404-4004-8404-1000000000a1' $$,
  'school_id is immutable','trigger: school_id can never change on attendance_sessions');

select throws_ok(
  $$ insert into public.attendance_records (id, school_id, attendance_session_id, student_id, status) values
      ('f4040404-0404-4004-8404-900000000095','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000a1','f4040404-0404-4004-8404-1000000000b1','PRESENT') $$,
  'cross-tenant','trigger: attendance record cannot reference School B student (repeat guard)');

select * from finish();
rollback;
