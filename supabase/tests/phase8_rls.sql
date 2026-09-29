-- SIMPLEIN SCHOOL ERP · Phase 8 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. timetable_slots under test (migration
-- 0008). One transaction; rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 9 +
-- throws_matching(…) 12 = 21. RLS checks run `set local role authenticated` +
-- SET request.jwt.claims. Trigger/integrity assertions run as the connecting
-- role (bypasses RLS), so tenant triggers see every row and report real
-- mismatches. Timetable reads are same-school for admins/parents but
-- assigned-section-only for teachers (migration 0012); finer parent/teacher
-- view scoping is service-enforced and unit-tested — the suite asserts the
-- real RLS semantic.

create extension if not exists pgtap;
begin;
select plan(21); -- 21 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f0808080-0808-4008-8808-0000000000a1','authenticated','authenticated','t8.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0808080-0808-4008-8808-0000000000a2','authenticated','authenticated','t8.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0808080-0808-4008-8808-0000000000a3','authenticated','authenticated','t8.teacherA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0808080-0808-4008-8808-0000000000a4','authenticated','authenticated','t8.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0808080-0808-4008-8808-0000000000b1','authenticated','authenticated','t8.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f0808080-0808-4008-8808-1000000000a1','Phase8 School A','phase8-school-a'),
  ('f0808080-0808-4008-8808-1000000000b1','Phase8 School B','phase8-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f0808080-0808-4008-8808-1100000000b1','f0808080-0808-4008-8808-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f0808080-0808-4008-8808-2000000000a1','f0808080-0808-4008-8808-0000000000a1','f0808080-0808-4008-8808-1000000000a1','phase8.adminA@phase.tests','Admin A'),
  ('f0808080-0808-4008-8808-2000000000a2','f0808080-0808-4008-8808-0000000000a2','f0808080-0808-4008-8808-1000000000a1','phase8.teacherA@phase.tests','Teacher A'),
  ('f0808080-0808-4008-8808-2000000000a3','f0808080-0808-4008-8808-0000000000a3','f0808080-0808-4008-8808-1000000000a1','phase8.teacherA2@phase.tests','Teacher A2'),
  ('f0808080-0808-4008-8808-2000000000a4','f0808080-0808-4008-8808-0000000000a4','f0808080-0808-4008-8808-1000000000a1','phase8.parentA@phase.tests','Parent A'),
  ('f0808080-0808-4008-8808-2000000000b1','f0808080-0808-4008-8808-0000000000b1','f0808080-0808-4008-8808-1000000000b1','phase8.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f0808080-0808-4008-8808-2000000000a1','SCHOOL_ADMIN'),
  ('f0808080-0808-4008-8808-2000000000a2','TEACHER'),
  ('f0808080-0808-4008-8808-2000000000a3','TEACHER'),
  ('f0808080-0808-4008-8808-2000000000a4','PARENT'),
  ('f0808080-0808-4008-8808-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f0808080-0808-4008-8808-3000000000a1','f0808080-0808-4008-8808-1000000000a1','Grade 7',7),
  ('f0808080-0808-4008-8808-3000000000b1','f0808080-0808-4008-8808-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f0808080-0808-4008-8808-2000000000a2','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-2000000000a2','E1','Ravi','Ravi'),
  ('f0808080-0808-4008-8808-2000000000a3','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-2000000000a3','E2','Priya','Priya'),
  ('f0808080-0808-4008-8808-2000000000b2','f0808080-0808-4008-8808-1000000000b1',null,'EB1','Far Teacher','Far Teacher')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f0808080-0808-4008-8808-4000000000a1','f0808080-0808-4008-8808-1000000000a1','Mathematics','MATH'),
  ('f0808080-0808-4008-8808-4000000000b1','f0808080-0808-4008-8808-1000000000b1','Art','ART')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f0808080-0808-4008-8808-5000000000a1','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-3000000000a1','A','f0808080-0808-4008-8808-2000000000a2'),
  ('f0808080-0808-4008-8808-5000000000a2','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-3000000000a1','B','f0808080-0808-4008-8808-2000000000a3'),
  ('f0808080-0808-4008-8808-5000000000b1','f0808080-0808-4008-8808-1000000000b1','f0808080-0808-4008-8808-3000000000b1','A', null)
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f0808080-0808-4008-8808-6000000000a1','f0808080-0808-4008-8808-1000000000a1','801','Sonia','P8','Sonia P8','f0808080-0808-4008-8808-3000000000a1','f0808080-0808-4008-8808-5000000000a1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f0808080-0808-4008-8808-2000000000a4','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-2000000000a4','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f0808080-0808-4008-8808-6000000000a1','f0808080-0808-4008-8808-2000000000a4','mother', true)
on conflict do nothing;

insert into public.timetable_slots (id, school_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, period_index, starts_at, ends_at, room) values
  ('f0808080-0808-4008-8808-7000000000a1','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1','f0808080-0808-4008-8808-4000000000a1','f0808080-0808-4008-8808-2000000000a2',1,0,'09:00','09:40','R1'),
  ('f0808080-0808-4008-8808-7000000000a2','f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a2','f0808080-0808-4008-8808-4000000000a1','f0808080-0808-4008-8808-2000000000a3',1,0,'10:00','10:40','R2'),
  ('f0808080-0808-4008-8808-7000000000b1','f0808080-0808-4008-8808-1000000000b1','f0808080-0808-4008-8808-1100000000b1','f0808080-0808-4008-8808-5000000000b1','f0808080-0808-4008-8808-4000000000b1',null,1,0,'09:00','09:40','R9')
on conflict (id) do nothing;

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Tenant isolation — School A timetable: A→A allowed, A→B denied.
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000a1"}';
select is((select count(*)::int from public.timetable_slots where school_id='f0808080-0808-4008-8808-1000000000a1'),2,'A: admin A sees both School A slots');
select is((select count(*)::int from public.timetable_slots where school_id='f0808080-0808-4008-8808-1000000000b1'),0,'A: admin A sees zero School B slots');
update public.timetable_slots set room = 'x' where id = 'f0808080-0808-4008-8808-7000000000b1';
select is((select count(*)::int from public.timetable_slots where room = 'x'),0,'A: admin A update of School B slot had zero effect');

-- B. Teacher scope: assigned sections only (migration 0012 tightened reads;
-- service views scope identically).
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000a2"}';
select is((select count(*)::int from public.timetable_slots where school_id='f0808080-0808-4008-8808-1000000000a1'),1,'B: teacher reads assigned-section slots');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1',5,0,'09:30','10:10') $$,
  'row-level security policy','B: teacher cannot insert slots (admin-only writes)');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000b1','f0808080-0808-4008-8808-1100000000b1','f0808080-0808-4008-8808-5000000000b1',5,0,'09:30','10:10') $$,
  'does not exist','B: teacher cannot insert cross-school slots (section invisible, denied)');

-- C. Parent scope: same-school reads; no writes.
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000a4"}';
select is((select count(*)::int from public.timetable_slots where school_id='f0808080-0808-4008-8808-1000000000a1'),2,'C: parent reads same-school slots');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1',5,1,'09:30','10:10') $$,
  'row-level security policy','C: parent cannot insert slots (read-only)');

-- ------------------------- conflict assertions (connecting role) -------------------------
reset role;

select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1',1,0,'11:00','11:40') $$,
  'duplicate key value','D: section overlap blocked (UNIQUE section/day/period)');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, teacher_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a2','f0808080-0808-4008-8808-2000000000a2',1,0,'11:00','11:40') $$,
  'duplicate key value','D: teacher double-booking blocked (partial UNIQUE year/teacher/day/period)');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1',2,0,'11:00','10:10') $$,
  'violates check constraint','D: inverted time range rejected (CHECK)');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1',9,5,'11:00','11:40') $$,
  'violates check constraint','D: out-of-range day rejected (CHECK)');

-- ------------------------- trigger assertions (connecting role) -------------------------
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, subject_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000b1','f0808080-0808-4008-8808-4000000000a1',2,1,'09:30','10:10') $$,
  'cross-tenant reference: sections','E: cross-tenant section reference rejected');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000b1','f0808080-0808-4008-8808-5000000000a1',2,1,'09:30','10:10') $$,
  'cross-tenant reference: academic_years','E: cross-tenant academic-year reference rejected');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, subject_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1','f0808080-0808-4008-8808-4000000000b1',2,1,'09:30','10:10') $$,
  'cross-tenant reference: subjects','E: cross-tenant subject reference rejected');
select throws_matching(
  $$ insert into public.timetable_slots (school_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, period_index, starts_at, ends_at) values
      ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1','f0808080-0808-4008-8808-4000000000a1','f0808080-0808-4008-8808-2000000000b2',2,1,'09:30','10:10') $$,
  'cross-tenant reference: teachers','E: cross-tenant teacher reference rejected');
select throws_matching(
  $$ update public.timetable_slots set school_id='f0808080-0808-4008-8808-1000000000b1'
      where id='f0808080-0808-4008-8808-7000000000a1' $$,
  'school_id is immutable','E: school_id can never change on a slot row');

-- ------------------------- modification authorization -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000a2"}';
update public.timetable_slots set room = 't' where id = 'f0808080-0808-4008-8808-7000000000a1';
select is((select count(*)::int from public.timetable_slots where room = 't'),0,'F: teacher cannot modify slots (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000a4"}';
delete from public.timetable_slots where id = 'f0808080-0808-4008-8808-7000000000a1';
select is((select count(*)::int from public.timetable_slots where id='f0808080-0808-4008-8808-7000000000a1'),1,'F: parent cannot delete slots (slot retained)');
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000a1"}';
insert into public.timetable_slots (school_id, academic_year_id, section_id, day_of_week, period_index, starts_at, ends_at) values
  ('f0808080-0808-4008-8808-1000000000a1','f0808080-0808-4008-8808-1100000000a1','f0808080-0808-4008-8808-5000000000a1',2,1,'10:00','10:40');
select is((select count(*)::int from public.timetable_slots where day_of_week=2 and period_index=1),1,'F: admin A inserts an own-school slot');
set local "request.jwt.claims" = '{"sub":"f0808080-0808-4008-8808-0000000000b1"}';
update public.timetable_slots set room = 'z' where id = 'f0808080-0808-4008-8808-7000000000a1';
select is((select count(*)::int from public.timetable_slots where room = 'z'),0,'F: admin B update of School A slot had zero effect');

select * from finish();
rollback;
