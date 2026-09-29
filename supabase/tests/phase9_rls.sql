-- SIMPLEIN SCHOOL ERP · Phase 9 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. homework + homework_attachments + the
-- homework-attachments bucket under test (migration 0009). One transaction;
-- rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 21 +
-- throws_matching(…) 11 = 32. RLS checks run `set local role authenticated` +
-- SET request.jwt.claims. Trigger/integrity assertions run as the connecting
-- role (bypasses RLS), so tenant triggers see every row and report real
-- mismatches. Homework writes are SECTION-level in RLS (subject/authorship
-- checks are service-enforced and unit-tested) — the suite asserts the real
-- RLS semantic, including the cases where RLS allows and the service denies.

create extension if not exists pgtap;
begin;
select plan(32); -- 32 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f0909090-0909-4009-8909-0000000000a1','authenticated','authenticated','t9.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0909090-0909-4009-8909-0000000000a2','authenticated','authenticated','t9.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0909090-0909-4009-8909-0000000000a3','authenticated','authenticated','t9.teacherA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0909090-0909-4009-8909-0000000000a4','authenticated','authenticated','t9.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0909090-0909-4009-8909-0000000000b1','authenticated','authenticated','t9.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f0909090-0909-4009-8909-1000000000a1','Phase9 School A','phase9-school-a'),
  ('f0909090-0909-4009-8909-1000000000b1','Phase9 School B','phase9-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f0909090-0909-4009-8909-1100000000b1','f0909090-0909-4009-8909-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f0909090-0909-4009-8909-2000000000a1','f0909090-0909-4009-8909-0000000000a1','f0909090-0909-4009-8909-1000000000a1','phase9.adminA@phase.tests','Admin A'),
  ('f0909090-0909-4009-8909-2000000000a2','f0909090-0909-4009-8909-0000000000a2','f0909090-0909-4009-8909-1000000000a1','phase9.teacherA@phase.tests','Teacher A'),
  ('f0909090-0909-4009-8909-2000000000a3','f0909090-0909-4009-8909-0000000000a3','f0909090-0909-4009-8909-1000000000a1','phase9.teacherA2@phase.tests','Teacher A2'),
  ('f0909090-0909-4009-8909-2000000000a4','f0909090-0909-4009-8909-0000000000a4','f0909090-0909-4009-8909-1000000000a1','phase9.parentA@phase.tests','Parent A'),
  ('f0909090-0909-4009-8909-2000000000b1','f0909090-0909-4009-8909-0000000000b1','f0909090-0909-4009-8909-1000000000b1','phase9.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f0909090-0909-4009-8909-2000000000a1','SCHOOL_ADMIN'),
  ('f0909090-0909-4009-8909-2000000000a2','TEACHER'),
  ('f0909090-0909-4009-8909-2000000000a3','TEACHER'),
  ('f0909090-0909-4009-8909-2000000000a4','PARENT'),
  ('f0909090-0909-4009-8909-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f0909090-0909-4009-8909-3000000000a1','f0909090-0909-4009-8909-1000000000a1','Grade 7',7),
  ('f0909090-0909-4009-8909-3000000000b1','f0909090-0909-4009-8909-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f0909090-0909-4009-8909-2000000000a2','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-2000000000a2','E1','Ravi','Ravi'),
  ('f0909090-0909-4009-8909-2000000000a3','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-2000000000a3','E2','Priya','Priya'),
  ('f0909090-0909-4009-8909-2000000000b2','f0909090-0909-4009-8909-1000000000b1',null,'EB1','Far Teacher','Far Teacher')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-1000000000a1','Mathematics','MATH'),
  ('f0909090-0909-4009-8909-4000000000a2','f0909090-0909-4009-8909-1000000000a1','English','ENG'),
  ('f0909090-0909-4009-8909-4000000000b1','f0909090-0909-4009-8909-1000000000b1','Art','ART')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-3000000000a1','A','f0909090-0909-4009-8909-2000000000a2'),
  ('f0909090-0909-4009-8909-5000000000a2','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-3000000000a1','B', null),
  ('f0909090-0909-4009-8909-5000000000b1','f0909090-0909-4009-8909-1000000000b1','f0909090-0909-4009-8909-3000000000b1','A', null)
on conflict (id) do nothing;

insert into public.teacher_subjects (school_id, teacher_id, subject_id, section_id) values
  ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-2000000000a3','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-5000000000a1')
on conflict do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f0909090-0909-4009-8909-6000000000a1','f0909090-0909-4009-8909-1000000000a1','901','Sonia','P9','Sonia P9','f0909090-0909-4009-8909-3000000000a1','f0909090-0909-4009-8909-5000000000a1','active'),
  ('f0909090-0909-4009-8909-6000000000a2','f0909090-0909-4009-8909-1000000000a1','902','Rahul','P9','Rahul P9','f0909090-0909-4009-8909-3000000000a1','f0909090-0909-4009-8909-5000000000a2','active'),
  ('f0909090-0909-4009-8909-6000000000b1','f0909090-0909-4009-8909-1000000000b1','B901','Far','B','Far Child','f0909090-0909-4009-8909-3000000000b1','f0909090-0909-4009-8909-5000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f0909090-0909-4009-8909-2000000000a4','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-2000000000a4','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f0909090-0909-4009-8909-6000000000a1','f0909090-0909-4009-8909-2000000000a4','mother', true)
on conflict do nothing;

insert into public.homework (id, school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
  ('f0909090-0909-4009-8909-7000000000a1','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a2','Fractions HW','Do pages 10-12','2026-09-01','2026-09-08'),
  ('f0909090-0909-4009-8909-7000000000a2','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a2','f0909090-0909-4009-8909-4000000000a2','f0909090-0909-4009-8909-2000000000a2','Essay HW','Write 300 words','2026-09-01','2026-09-08'),
  ('f0909090-0909-4009-8909-7000000000b1','f0909090-0909-4009-8909-1000000000b1','f0909090-0909-4009-8909-1100000000b1','f0909090-0909-4009-8909-5000000000b1','f0909090-0909-4009-8909-4000000000b1','f0909090-0909-4009-8909-2000000000b2','Sketch HW','Draw a tree','2026-09-01','2026-09-08')
on conflict (id) do nothing;

insert into public.homework_attachments (id, school_id, homework_id, bucket, path, original_name, mime, bytes, uploaded_by) values
  ('f0909090-0909-4009-8909-7100000000a1','f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-7000000000a1','homework-attachments','schools/f0909090-0909-4009-8909-1000000000a1/homework/f0909090-0909-4009-8909-7000000000a1/a.pdf','a.pdf','application/pdf',100,'f0909090-0909-4009-8909-2000000000a1'),
  ('f0909090-0909-4009-8909-7100000000b1','f0909090-0909-4009-8909-1000000000b1','f0909090-0909-4009-8909-7000000000b1','homework-attachments','schools/f0909090-0909-4009-8909-1000000000b1/homework/f0909090-0909-4009-8909-7000000000b1/b.pdf','b.pdf','application/pdf',200,'f0909090-0909-4009-8909-2000000000b1')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('homework-attachments', 'schools/f0909090-0909-4009-8909-1000000000a1/homework/f0909090-0909-4009-8909-7000000000a1/a.pdf'),
  ('homework-attachments', 'schools/f0909090-0909-4009-8909-1000000000b1/homework/f0909090-0909-4009-8909-7000000000b1/b.pdf');

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Tenant isolation — School A homework: A→A allowed, A→B denied.
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a1"}';
select is((select count(*)::int from public.homework where school_id='f0909090-0909-4009-8909-1000000000a1'),2,'A: admin A sees both School A homework rows');
select is((select count(*)::int from public.homework where school_id='f0909090-0909-4009-8909-1000000000b1'),0,'A: admin A sees zero School B homework');
select is((select count(*)::int from public.homework_attachments where school_id='f0909090-0909-4009-8909-1000000000a1'),1,'A: admin A sees own-school attachments');
update public.homework set title = 'x' where id = 'f0909090-0909-4009-8909-7000000000b1';
select is((select count(*)::int from public.homework where title = 'x'),0,'A: admin A update of School B homework had zero effect');

-- B. Teacher reads: assigned sections only (T = class teacher of sec7a).
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a2"}';
select is((select count(*)::int from public.homework where section_id='f0909090-0909-4009-8909-5000000000a1'),1,'B: teacher T reads own-section homework');
select is((select count(*)::int from public.homework where section_id='f0909090-0909-4009-8909-5000000000a2'),0,'B: teacher T reads zero unassigned-section homework');

-- C. Parent reads: linked child's section only.
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a4"}';
select is((select count(*)::int from public.homework where section_id='f0909090-0909-4009-8909-5000000000a1'),1,'C: parent reads linked-section homework');
select is((select count(*)::int from public.homework where section_id='f0909090-0909-4009-8909-5000000000a2'),0,'C: parent reads zero unlinked-section homework');
select is((select count(*)::int from public.homework_attachments ha join public.homework h on h.id = ha.homework_id where h.section_id='f0909090-0909-4009-8909-5000000000a1'),1,'C: parent reads linked-section attachments');
select is((select count(*)::int from public.homework_attachments where school_id='f0909090-0909-4009-8909-1000000000b1'),0,'C: parent reads zero School B attachments');

-- B/C writes: T inserts own-section (allowed); unassigned/cross-school denied.
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a2"}';
insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
  ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a2','T Class HW','Do Y','2026-09-01','2026-09-08');
select is((select count(*)::int from public.homework where title='T Class HW'),1,'B: teacher T inserts own-section homework');
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a2','f0909090-0909-4009-8909-4000000000a2','f0909090-0909-4009-8909-2000000000a2','X','X','2026-09-01','2026-09-08') $$,
  'row-level security policy','B: teacher T cannot insert unassigned-section homework');
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000b1','f0909090-0909-4009-8909-1100000000b1','f0909090-0909-4009-8909-5000000000b1','f0909090-0909-4009-8909-4000000000b1','f0909090-0909-4009-8909-2000000000b2','X','X','2026-09-01','2026-09-08') $$,
  'does not exist','B: teacher T cannot insert cross-school homework (section invisible, denied)');

-- T2 (Math assignee, sec7a): RLS is section-level, so both inserts succeed at
-- the DB — subject/authorship scoping is service-enforced (unit-tested).
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a3"}';
insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
  ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a3','T2 Math HW','Do Z','2026-09-01','2026-09-08');
select is((select count(*)::int from public.homework where title='T2 Math HW'),1,'B: teacher T2 inserts assigned-subject homework');
insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
  ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a2','f0909090-0909-4009-8909-2000000000a3','T2 Eng HW','Do W','2026-09-01','2026-09-08');
select is((select count(*)::int from public.homework where title='T2 Eng HW'),1,'B: RLS allows T2 English insert at section scope (subject denied in service, not RLS)');

-- C write denial: parents are read-only.
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a4"}';
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a2','X','X','2026-09-01','2026-09-08') $$,
  'row-level security policy','C: parent cannot insert homework (read-only)');

-- ------------------------- trigger assertions (connecting role) -------------------------
reset role;

select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000b1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a2','X','X','2026-09-01','2026-09-08') $$,
  'cross-tenant reference: sections','E: cross-tenant section reference rejected');
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000b1','f0909090-0909-4009-8909-2000000000a2','X','X','2026-09-01','2026-09-08') $$,
  'cross-tenant reference: subjects','E: cross-tenant subject reference rejected');
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000b2','X','X','2026-09-01','2026-09-08') $$,
  'cross-tenant reference: teachers','E: cross-tenant teacher reference rejected');
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a2','X','X','2026-10-05','2026-10-01') $$,
  'violates check constraint','E: due-before-assigned rejected (CHECK)');
select throws_matching(
  $$ insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a1','f0909090-0909-4009-8909-2000000000a2','','X','2026-09-01','2026-09-08') $$,
  'violates check constraint','E: empty title rejected (CHECK)');
select throws_matching(
  $$ insert into public.homework_attachments (school_id, homework_id, bucket, path, original_name, mime, bytes) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-7000000000b1','homework-attachments','schools/f0909090-0909-4009-8909-1000000000a1/x.pdf','x.pdf','application/pdf',100) $$,
  'cross-tenant reference: homework','E: cross-tenant homework reference rejected');
select throws_matching(
  $$ insert into public.homework_attachments (school_id, homework_id, bucket, path, original_name, mime, bytes) values
      ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-7000000000a1','homework-attachments','schools/f0909090-0909-4009-8909-1000000000a1/y.pdf','y.pdf','application/pdf',0) $$,
  'violates check constraint','E: zero-byte attachment rejected (CHECK)');
select throws_matching(
  $$ update public.homework set school_id='f0909090-0909-4009-8909-1000000000b1'
      where id='f0909090-0909-4009-8909-7000000000a1' $$,
  'school_id is immutable','E: school_id can never change on a homework row');

-- ------------------------- modification authorization -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a2"}';
update public.homework set title = 'Fractions HW (edited)' where id = 'f0909090-0909-4009-8909-7000000000a1';
select is((select count(*)::int from public.homework where title = 'Fractions HW (edited)'),1,'F: teacher T edits own-section homework');
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a4"}';
update public.homework set title = 'Hacked' where id = 'f0909090-0909-4009-8909-7000000000a1';
select is((select count(*)::int from public.homework where title = 'Hacked'),0,'F: parent cannot modify homework (read-only)');
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a1"}';
insert into public.homework (school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
  ('f0909090-0909-4009-8909-1000000000a1','f0909090-0909-4009-8909-1100000000a1','f0909090-0909-4009-8909-5000000000a1','f0909090-0909-4009-8909-4000000000a2','f0909090-0909-4009-8909-2000000000a2','Admin HW','Do V','2026-09-01','2026-09-08');
select is((select count(*)::int from public.homework where title='Admin HW'),1,'F: admin A inserts own-school homework');
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000b1"}';
update public.homework set title = 'Hacked' where id = 'f0909090-0909-4009-8909-7000000000a1';
select is((select count(*)::int from public.homework where title = 'Hacked'),0,'F: admin B update of School A homework had zero effect');

-- ------------------------- storage assertions -------------------------
-- storage.buckets has no authenticated SELECT policy by design; the privacy
-- check runs as the connecting role (like trusted ops).
reset role;
select is((select public from storage.buckets where id = 'homework-attachments'), false, 'D: homework-attachments bucket is private (signed URLs only)');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000a1"}';
select is((select count(*)::int from storage.objects where bucket_id='homework-attachments' and name like 'schools/f0909090-0909-4009-8909-1000000000a1/%'),1,'D: admin A lists own-school attachments only');
select is((select count(*)::int from storage.objects where bucket_id='homework-attachments' and name like 'schools/f0909090-0909-4009-8909-1000000000b1/%'),0,'D: admin A lists zero School B attachments');
set local "request.jwt.claims" = '{"sub":"f0909090-0909-4009-8909-0000000000b1"}';
select is((select count(*)::int from storage.objects where bucket_id='homework-attachments' and name like 'schools/f0909090-0909-4009-8909-1000000000b1/%'),1,'D: admin B lists own-school attachments only');

select * from finish();
rollback;
