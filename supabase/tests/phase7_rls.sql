-- SIMPLEIN SCHOOL ERP · Phase 7 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. report_cards + report-cards bucket under test.
-- One transaction; rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 17 +
-- throws_matching(…) 8 = 25. RLS checks run `set local role authenticated` +
-- SET request.jwt.claims. Trigger/integrity assertions run as the connecting
-- role (bypasses RLS), so tenant triggers see every row and report real
-- mismatches. Teacher report-card scope is CLASS-level in RLS (any assigned
-- section of the exam's class grants the class); student-level scoping is
-- service-enforced and unit-tested — the suite asserts the real RLS semantic.

create extension if not exists pgtap;
begin;
select plan(25); -- 25 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f0707070-0707-4007-8707-0000000000a1','authenticated','authenticated','t7.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0707070-0707-4007-8707-0000000000a2','authenticated','authenticated','t7.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0707070-0707-4007-8707-0000000000a3','authenticated','authenticated','t7.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f0707070-0707-4007-8707-0000000000b1','authenticated','authenticated','t7.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f0707070-0707-4007-8707-1000000000a1','Phase7 School A','phase7-school-a'),
  ('f0707070-0707-4007-8707-1000000000b1','Phase7 School B','phase7-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f0707070-0707-4007-8707-1100000000a1','f0707070-0707-4007-8707-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f0707070-0707-4007-8707-1100000000b1','f0707070-0707-4007-8707-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f0707070-0707-4007-8707-2000000000a1','f0707070-0707-4007-8707-0000000000a1','f0707070-0707-4007-8707-1000000000a1','phase7.adminA@phase.tests','Admin A'),
  ('f0707070-0707-4007-8707-2000000000a2','f0707070-0707-4007-8707-0000000000a2','f0707070-0707-4007-8707-1000000000a1','phase7.teacherA@phase.tests','Teacher A'),
  ('f0707070-0707-4007-8707-2000000000a3','f0707070-0707-4007-8707-0000000000a3','f0707070-0707-4007-8707-1000000000a1','phase7.parentA@phase.tests','Parent A'),
  ('f0707070-0707-4007-8707-2000000000b1','f0707070-0707-4007-8707-0000000000b1','f0707070-0707-4007-8707-1000000000b1','phase7.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f0707070-0707-4007-8707-2000000000a1','SCHOOL_ADMIN'),
  ('f0707070-0707-4007-8707-2000000000a2','TEACHER'),
  ('f0707070-0707-4007-8707-2000000000a3','PARENT'),
  ('f0707070-0707-4007-8707-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f0707070-0707-4007-8707-3000000000a1','f0707070-0707-4007-8707-1000000000a1','Grade 7',7),
  ('f0707070-0707-4007-8707-3000000000b1','f0707070-0707-4007-8707-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f0707070-0707-4007-8707-2000000000a2','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-2000000000a2','E1','Ravi','Ravi')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f0707070-0707-4007-8707-4000000000a1','f0707070-0707-4007-8707-1000000000a1','Mathematics','MATH')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f0707070-0707-4007-8707-5000000000a1','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-3000000000a1','A','f0707070-0707-4007-8707-2000000000a2'),
  ('f0707070-0707-4007-8707-5000000000a2','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-3000000000a1','B', null),
  ('f0707070-0707-4007-8707-5000000000b1','f0707070-0707-4007-8707-1000000000b1','f0707070-0707-4007-8707-3000000000b1','A', null)
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f0707070-0707-4007-8707-6000000000a1','f0707070-0707-4007-8707-1000000000a1','701','Sonia','P7','Sonia P7','f0707070-0707-4007-8707-3000000000a1','f0707070-0707-4007-8707-5000000000a1','active'),
  ('f0707070-0707-4007-8707-6000000000a2','f0707070-0707-4007-8707-1000000000a1','702','Rahul','P7','Rahul P7','f0707070-0707-4007-8707-3000000000a1','f0707070-0707-4007-8707-5000000000a2','active'),
  ('f0707070-0707-4007-8707-6000000000b1','f0707070-0707-4007-8707-1000000000b1','B701','Far','B','Far Child','f0707070-0707-4007-8707-3000000000b1','f0707070-0707-4007-8707-5000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f0707070-0707-4007-8707-2000000000a3','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-2000000000a3','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f0707070-0707-4007-8707-6000000000a1','f0707070-0707-4007-8707-2000000000a3','mother', true)
on conflict do nothing;

insert into public.exams (id, school_id, academic_year_id, class_id, name, starts_on, ends_on) values
  ('f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-1100000000a1','f0707070-0707-4007-8707-3000000000a1','Unit Test 1','2026-09-01','2026-09-30'),
  ('f0707070-0707-4007-8707-8000000000a2','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-1100000000a1','f0707070-0707-4007-8707-3000000000a1','Half-Yearly','2026-11-01','2026-11-30'),
  ('f0707070-0707-4007-8707-8000000000b1','f0707070-0707-4007-8707-1000000000b1','f0707070-0707-4007-8707-1100000000b1','f0707070-0707-4007-8707-3000000000b1','Final','2027-02-01','2027-02-28')
on conflict (id) do nothing;

insert into public.grading_systems (id, school_id, name, is_default) values
  ('f0707070-0707-4007-8707-8300000000a1','f0707070-0707-4007-8707-1000000000a1','Phase7 Default', true),
  ('f0707070-0707-4007-8707-8300000000b1','f0707070-0707-4007-8707-1000000000b1','Phase7 B', true)
on conflict (id) do nothing;

insert into public.report_cards (id, school_id, exam_id, student_id, grading_system_id, total_obtained, max_total, status) values
  ('f0707070-0707-4007-8707-8100000000a1','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-6000000000a1','f0707070-0707-4007-8707-8300000000a1',80,100,'PUBLISHED'),
  ('f0707070-0707-4007-8707-8000000000a2','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-6000000000a2',null,60,100,'DRAFT'),
  ('f0707070-0707-4007-8707-8000000000a3','f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a2','f0707070-0707-4007-8707-6000000000a1',null,70,100,'DRAFT'),
  ('f0707070-0707-4007-8707-8100000000b1','f0707070-0707-4007-8707-1000000000b1','f0707070-0707-4007-8707-8000000000b1','f0707070-0707-4007-8707-6000000000b1','f0707070-0707-4007-8707-8300000000b1',30,50,'PUBLISHED')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('report-cards', 'schools/f0707070-0707-4007-8707-1000000000a1/report-cards/f0707070-0707-4007-8707-8100000000a1.pdf'),
  ('report-cards', 'schools/f0707070-0707-4007-8707-1000000000b1/report-cards/f0707070-0707-4007-8707-8100000000b1.pdf');

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Tenant isolation — School A report cards: A→A allowed, A→B denied.
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a1"}';
select is((select count(*)::int from public.report_cards where school_id='f0707070-0707-4007-8707-1000000000a1'),3,'A: admin A sees all three School A snapshots');
select is((select count(*)::int from public.report_cards where school_id='f0707070-0707-4007-8707-1000000000b1'),0,'A: admin A sees zero School B snapshots');
update public.report_cards set remarks = 'x' where id = 'f0707070-0707-4007-8707-8100000000b1';
select is((select count(*)::int from public.report_cards where remarks = 'x'),0,'A: admin A update of School B snapshot had zero effect');

-- B. Teacher scope: class-level in RLS (any assigned section of the exam class
-- grants the class); finer student scoping lives in the service layer.
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a2"}';
select is((select count(*)::int from public.report_cards where exam_id in ('f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-8000000000a2')),3,'B: teacher sees assigned-class snapshots');
select is((select count(*)::int from public.report_cards where school_id='f0707070-0707-4007-8707-1000000000b1'),0,'B: teacher sees zero School B snapshots');
select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-6000000000a1') $$,
  'row-level security policy','B: teacher cannot insert snapshots (admin-only writes)');

-- C. Parent scope (linked to s1; PUBLISHED snapshots only).
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a3"}';
select is((select count(*)::int from public.report_cards),1,'C: parent sees only the one published linked snapshot');
select is((select count(*)::int from public.report_cards where student_id='f0707070-0707-4007-8707-6000000000a2'),0,'C: parent sees zero unlinked-child snapshots');
select is((select count(*)::int from public.report_cards where student_id='f0707070-0707-4007-8707-6000000000a1' and status='DRAFT'),0,'C: parent sees zero DRAFT snapshots of own child');
select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-6000000000a1') $$,
  'row-level security policy','C: parent cannot insert snapshots (read-only)');
update public.report_cards set remarks = 'y' where id = 'f0707070-0707-4007-8707-8100000000a1';
select is((select count(*)::int from public.report_cards where remarks = 'y'),0,'C: parent cannot modify snapshots (read-only)');

-- ------------------------- trigger assertions (connecting role) -------------------------
-- storage.buckets has no authenticated SELECT policy by design, so the
-- bucket-privacy check also runs here (bypassing RLS like trusted ops).
reset role;

select is((select public from storage.buckets where id = 'report-cards'), false, 'D: report-cards bucket is private (signed URLs only)');

select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000b1','f0707070-0707-4007-8707-6000000000a1') $$,
  'cross-tenant reference: exams','E: cross-tenant exam reference rejected');
select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-6000000000b1') $$,
  'cross-tenant reference: students','E: cross-tenant student reference rejected');
select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id, grading_system_id) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a2','f0707070-0707-4007-8707-6000000000a2','f0707070-0707-4007-8707-8300000000b1') $$,
  'cross-tenant reference: grading_systems','E: cross-tenant grading-system reference rejected');
select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a1','f0707070-0707-4007-8707-6000000000a1') $$,
  'duplicate key value','E: duplicate snapshot for the same exam/student prevented');
select throws_matching(
  $$ insert into public.report_cards (school_id, exam_id, student_id, status) values
      ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a2','f0707070-0707-4007-8707-6000000000a2','FINAL') $$,
  'violates check constraint','E: invalid status rejected (CHECK)');
select throws_matching(
  $$ update public.report_cards set school_id='f0707070-0707-4007-8707-1000000000b1'
      where id='f0707070-0707-4007-8707-8100000000a1' $$,
  'school_id is immutable','E: school_id can never change on a snapshot row');

-- ------------------------- modification authorization -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a2"}';
update public.report_cards set remarks = 't' where id = 'f0707070-0707-4007-8707-8100000000a1';
select is((select count(*)::int from public.report_cards where remarks = 't'),0,'F: teacher cannot modify snapshots (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a3"}';
delete from public.report_cards where id = 'f0707070-0707-4007-8707-8100000000a1';
select is((select count(*)::int from public.report_cards where id='f0707070-0707-4007-8707-8100000000a1'),1,'F: parent cannot delete snapshots (snapshot retained)');
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a1"}';
insert into public.report_cards (school_id, exam_id, student_id) values
  ('f0707070-0707-4007-8707-1000000000a1','f0707070-0707-4007-8707-8000000000a2','f0707070-0707-4007-8707-6000000000a2');
select is((select count(*)::int from public.report_cards where exam_id='f0707070-0707-4007-8707-8000000000a2' and student_id='f0707070-0707-4007-8707-6000000000a2'),1,'F: admin A inserts an own-school snapshot');
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000b1"}';
update public.report_cards set remarks = 'z' where id = 'f0707070-0707-4007-8707-8100000000a1';
select is((select count(*)::int from public.report_cards where remarks = 'z'),0,'F: admin B update of School A snapshot had zero effect');

-- ------------------------- storage assertions -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000a1"}';
select is((select count(*)::int from storage.objects where bucket_id='report-cards' and name like 'schools/f0707070-0707-4007-8707-1000000000a1/%'),1,'D: admin A lists own-school PDFs only');
select is((select count(*)::int from storage.objects where bucket_id='report-cards' and name like 'schools/f0707070-0707-4007-8707-1000000000b1/%'),0,'D: admin A lists zero School B PDFs');
set local "request.jwt.claims" = '{"sub":"f0707070-0707-4007-8707-0000000000b1"}';
select is((select count(*)::int from storage.objects where bucket_id='report-cards' and name like 'schools/f0707070-0707-4007-8707-1000000000b1/%'),1,'D: admin B lists own-school PDFs only');

select * from finish();
rollback;
