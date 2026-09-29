-- SIMPLEIN SCHOOL ERP · Phase 10 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. notices + notice_targets + notifications +
-- the notice-attachments bucket under test (migration 0010). One transaction;
-- rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 18 +
-- throws_matching(…) 10 = 28. RLS checks run `set local role authenticated`
-- + SET request.jwt.claims. Trigger/integrity assertions run as the connecting
-- role (bypasses RLS), so tenant triggers see every row and report real
-- mismatches. Audience filtering is enforced in RLS (mirrored from the
-- service feeds) — the suite asserts the real RLS semantic.

create extension if not exists pgtap;
begin;
select plan(28); -- 28 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f1010101-1010-4101-8101-0000000000a1','authenticated','authenticated','t10.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1010101-1010-4101-8101-0000000000a2','authenticated','authenticated','t10.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1010101-1010-4101-8101-0000000000a3','authenticated','authenticated','t10.teacherA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1010101-1010-4101-8101-0000000000a4','authenticated','authenticated','t10.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1010101-1010-4101-8101-0000000000b1','authenticated','authenticated','t10.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f1010101-1010-4101-8101-1000000000a1','Phase10 School A','phase10-school-a'),
  ('f1010101-1010-4101-8101-1000000000b1','Phase10 School B','phase10-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f1010101-1010-4101-8101-1100000000a1','f1010101-1010-4101-8101-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f1010101-1010-4101-8101-1100000000b1','f1010101-1010-4101-8101-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f1010101-1010-4101-8101-2000000000a1','f1010101-1010-4101-8101-0000000000a1','f1010101-1010-4101-8101-1000000000a1','phase10.adminA@phase.tests','Admin A'),
  ('f1010101-1010-4101-8101-2000000000a2','f1010101-1010-4101-8101-0000000000a2','f1010101-1010-4101-8101-1000000000a1','phase10.teacherA@phase.tests','Teacher A'),
  ('f1010101-1010-4101-8101-2000000000a3','f1010101-1010-4101-8101-0000000000a3','f1010101-1010-4101-8101-1000000000a1','phase10.teacherA2@phase.tests','Teacher A2'),
  ('f1010101-1010-4101-8101-2000000000a4','f1010101-1010-4101-8101-0000000000a4','f1010101-1010-4101-8101-1000000000a1','phase10.parentA@phase.tests','Parent A'),
  ('f1010101-1010-4101-8101-2000000000b1','f1010101-1010-4101-8101-0000000000b1','f1010101-1010-4101-8101-1000000000b1','phase10.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f1010101-1010-4101-8101-2000000000a1','SCHOOL_ADMIN'),
  ('f1010101-1010-4101-8101-2000000000a2','TEACHER'),
  ('f1010101-1010-4101-8101-2000000000a3','TEACHER'),
  ('f1010101-1010-4101-8101-2000000000a4','PARENT'),
  ('f1010101-1010-4101-8101-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f1010101-1010-4101-8101-3000000000a1','f1010101-1010-4101-8101-1000000000a1','Grade 7',7),
  ('f1010101-1010-4101-8101-3000000000b1','f1010101-1010-4101-8101-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f1010101-1010-4101-8101-2000000000a2','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a2','E1','Ravi','Ravi'),
  ('f1010101-1010-4101-8101-2000000000a3','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a3','E2','Priya','Priya')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f1010101-1010-4101-8101-4000000000a1','f1010101-1010-4101-8101-1000000000a1','Mathematics','MATH')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f1010101-1010-4101-8101-5000000000a1','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-3000000000a1','A','f1010101-1010-4101-8101-2000000000a2'),
  ('f1010101-1010-4101-8101-5000000000a2','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-3000000000a1','B','f1010101-1010-4101-8101-2000000000a3'),
  ('f1010101-1010-4101-8101-5000000000b1','f1010101-1010-4101-8101-1000000000b1','f1010101-1010-4101-8101-3000000000b1','A', null)
on conflict (id) do nothing;

insert into public.teacher_subjects (school_id, teacher_id, subject_id, section_id) values
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a2','f1010101-1010-4101-8101-4000000000a1','f1010101-1010-4101-8101-5000000000a1')
on conflict do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f1010101-1010-4101-8101-6000000000a1','f1010101-1010-4101-8101-1000000000a1','1001','Sonia','P10','Sonia P10','f1010101-1010-4101-8101-3000000000a1','f1010101-1010-4101-8101-5000000000a1','active'),
  ('f1010101-1010-4101-8101-6000000000a2','f1010101-1010-4101-8101-1000000000a1','1002','Rahul','P10','Rahul P10','f1010101-1010-4101-8101-3000000000a1','f1010101-1010-4101-8101-5000000000a2','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f1010101-1010-4101-8101-2000000000a4','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a4','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f1010101-1010-4101-8101-6000000000a1','f1010101-1010-4101-8101-2000000000a4','mother', true)
on conflict do nothing;

insert into public.notices (id, school_id, title, content, category, is_published, created_by) values
  ('f1010101-1010-4101-8101-7000000000a1','f1010101-1010-4101-8101-1000000000a1','School Fair','Fair on Saturday','GENERAL', true,'f1010101-1010-4101-8101-2000000000a1'),
  ('f1010101-1010-4101-8101-7000000000a2','f1010101-1010-4101-8101-1000000000a1','Staff Meeting','Room 3 at 2pm','GENERAL', true,'f1010101-1010-4101-8101-2000000000a1'),
  ('f1010101-1010-4101-8101-7000000000a3','f1010101-1010-4101-8101-1000000000a1','Fee Reminder','Pay by Friday','GENERAL', true,'f1010101-1010-4101-8101-2000000000a1'),
  ('f1010101-1010-4101-8101-7000000000a4','f1010101-1010-4101-8101-1000000000a1','Sec A Trip','Bring lunch','GENERAL', true,'f1010101-1010-4101-8101-2000000000a1'),
  ('f1010101-1010-4101-8101-7000000000a5','f1010101-1010-4101-8101-1000000000a1','Sec B Quiz','Syllabus ch 4','GENERAL', true,'f1010101-1010-4101-8101-2000000000a1'),
  ('f1010101-1010-4101-8101-7000000000a6','f1010101-1010-4101-8101-1000000000a1','Grade 7 Play','Auditions open','GENERAL', true,'f1010101-1010-4101-8101-2000000000a1'),
  ('f1010101-1010-4101-8101-7000000000b1','f1010101-1010-4101-8101-1000000000b1','Far Notice','Far school news','GENERAL', true,'f1010101-1010-4101-8101-2000000000b1')
on conflict (id) do nothing;

insert into public.notice_targets (school_id, notice_id, audience_type, class_id, section_id) values
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a2','TEACHERS',null,null),
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a3','PARENTS',null,null),
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a4','SECTION',null,'f1010101-1010-4101-8101-5000000000a1'),
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a5','SECTION',null,'f1010101-1010-4101-8101-5000000000a2'),
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a6','CLASS','f1010101-1010-4101-8101-3000000000a1',null)
on conflict do nothing;

insert into public.notifications (id, school_id, user_id, type, title, message) values
  ('f1010101-1010-4101-8101-7100000000a1','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a2','NOTICE','Hi Teacher','Section meeting at 3'),
  ('f1010101-1010-4101-8101-7100000000a2','f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a4','NOTICE','Hi Parent','Fee due Friday')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('notice-attachments', 'schools/f1010101-1010-4101-8101-1000000000a1/notices/f1010101-1010-4101-8101-7000000000a1/fair.pdf'),
  ('notice-attachments', 'schools/f1010101-1010-4101-8101-1000000000b1/notices/f1010101-1010-4101-8101-7000000000b1/far.pdf');

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Tenant isolation — School A notices: A→A allowed, A→B denied.
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a1"}';
select is((select count(*)::int from public.notices where school_id='f1010101-1010-4101-8101-1000000000a1'),6,'A: admin A sees all six School A notices');
select is((select count(*)::int from public.notices where school_id='f1010101-1010-4101-8101-1000000000b1'),0,'A: admin A sees zero School B notices');
update public.notices set title = 'x' where id = 'f1010101-1010-4101-8101-7000000000b1';
select is((select count(*)::int from public.notices where title = 'x'),0,'A: admin A update of School B notice had zero effect');

-- B. Audience targeting in RLS: wide + channel + own sections/classes only.
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a2"}';
select is((select count(*)::int from public.notices where school_id='f1010101-1010-4101-8101-1000000000a1'),4,'B: teacher sees wide + TEACHERS + own-section + own-class notices');
select is((select count(*)::int from public.notices where id='f1010101-1010-4101-8101-7000000000a5'),0,'B: teacher sees zero other-section notices');
select is((select count(*)::int from public.notices where id='f1010101-1010-4101-8101-7000000000a3'),0,'B: teacher sees zero PARENTS-channel notices');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a4"}';
select is((select count(*)::int from public.notices where school_id='f1010101-1010-4101-8101-1000000000a1'),4,'B: parent sees wide + PARENTS + linked-section + linked-class notices');
select is((select count(*)::int from public.notices where id='f1010101-1010-4101-8101-7000000000a2'),0,'B: parent sees zero TEACHERS-channel notices');
select is((select count(*)::int from public.notices where school_id='f1010101-1010-4101-8101-1000000000b1'),0,'B: parent sees zero School B notices');

-- C. Notification recipient isolation: own rows only.
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a2"}';
select is((select count(*)::int from public.notifications),1,'C: teacher reads only own inbox row');
update public.notifications set is_read = true where user_id = 'f1010101-1010-4101-8101-2000000000a4';
-- The teacher cannot observe the other row at all, so the parent verifies it.
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a4"}';
select is((select count(*)::int from public.notifications where user_id='f1010101-1010-4101-8101-2000000000a4' and is_read = false),1,'C: teacher cannot mark-read another inbox (row retained unread)');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a2"}';
select throws_matching(
  $$ insert into public.notifications (school_id, user_id, type, title, message) values
      ('f1010101-1010-4101-8101-1000000000b1','f1010101-1010-4101-8101-2000000000a2','NOTICE','X','X') $$,
  'row-level security policy','C: cross-school fan-out denied');
insert into public.notifications (school_id, user_id, type, title, message) values
  ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a1','NOTICE','Fanout T','Cover duty rota');
select is((select count(*)::int from public.notifications where title='Fanout T'),0,'C: teacher fan-out lands outside own inbox (recipient-scoped reads)');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a4"}';
select throws_matching(
  $$ insert into public.notifications (school_id, user_id, type, title, message) values
      ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-2000000000a4','NOTICE','X','X') $$,
  'row-level security policy','C: parent cannot fan-out notifications (admin/teacher only)');

-- ------------------------- trigger assertions (connecting role) -------------------------
reset role;

select throws_matching(
  $$ insert into public.notice_targets (school_id, notice_id, audience_type, class_id) values
      ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a1','CLASS','f1010101-1010-4101-8101-3000000000b1') $$,
  'cross-tenant reference: classes','E: cross-tenant class target rejected');
select throws_matching(
  $$ insert into public.notice_targets (school_id, notice_id, audience_type, section_id) values
      ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a1','SECTION','f1010101-1010-4101-8101-5000000000b1') $$,
  'cross-tenant reference: sections','E: cross-tenant section target rejected');
-- NOTE: same-shape duplicate targets cannot violate the unique index:
-- every valid shape leaves class_id or section_id NULL, and NULLs never
-- conflict in a UNIQUE index. Shape validity itself IS enforced (below).
select throws_matching(
  $$ insert into public.notice_targets (school_id, notice_id, audience_type, class_id) values
      ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a1','CLASS',null) $$,
  'violates check constraint','E: CLASS target without a class rejected (shape CHECK)');
select throws_matching(
  $$ insert into public.notice_targets (school_id, notice_id, audience_type, class_id, section_id) values
      ('f1010101-1010-4101-8101-1000000000a1','f1010101-1010-4101-8101-7000000000a1','SCHOOL','f1010101-1010-4101-8101-3000000000a1',null) $$,
  'violates check constraint','E: malformed audience shape rejected (CHECK)');
select throws_matching(
  $$ insert into public.notices (school_id, title, content, category) values
      ('f1010101-1010-4101-8101-1000000000a1','X','X','UNKNOWN') $$,
  'violates check constraint','E: unknown category rejected (CHECK)');
-- NOTE: migration 0013 added the missing prevent_school_move trigger to
-- notices (parity with all other tenant tables), so the trigger — not RLS —
-- now rejects the move first, exactly like every sibling table.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a1"}';
select throws_matching(
  $$ update public.notices set school_id='f1010101-1010-4101-8101-1000000000b1'
      where id='f1010101-1010-4101-8101-7000000000a1' $$,
  'school_id is immutable','E: school_id can never change on a notice row (trigger)');
reset role;

-- ------------------------- modification authorization -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a2"}';
select throws_matching(
  $$ insert into public.notices (school_id, title, content) values
      ('f1010101-1010-4101-8101-1000000000a1','X','X') $$,
  'row-level security policy','F: teacher cannot create notices (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a4"}';
select throws_matching(
  $$ insert into public.notices (school_id, title, content) values
      ('f1010101-1010-4101-8101-1000000000a1','X','X') $$,
  'row-level security policy','F: parent cannot create notices (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a1"}';
insert into public.notices (school_id, title, content, created_by) values
  ('f1010101-1010-4101-8101-1000000000a1','Admin Extra','Extra body','f1010101-1010-4101-8101-2000000000a1');
select is((select count(*)::int from public.notices where title='Admin Extra'),1,'F: admin A inserts an own-school notice');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000b1"}';
update public.notices set title = 'z' where id = 'f1010101-1010-4101-8101-7000000000a1';
select is((select count(*)::int from public.notices where title = 'z'),0,'F: admin B update of School A notice had zero effect');

-- ------------------------- storage assertions -------------------------
reset role;
select is((select public from storage.buckets where id = 'notice-attachments'), false, 'D: notice-attachments bucket is private (signed URLs only)');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000a1"}';
select is((select count(*)::int from storage.objects where bucket_id='notice-attachments' and name like 'schools/f1010101-1010-4101-8101-1000000000a1/%'),1,'D: admin A lists own-school attachments only');
select is((select count(*)::int from storage.objects where bucket_id='notice-attachments' and name like 'schools/f1010101-1010-4101-8101-1000000000b1/%'),0,'D: admin A lists zero School B attachments');
set local "request.jwt.claims" = '{"sub":"f1010101-1010-4101-8101-0000000000b1"}';
select is((select count(*)::int from storage.objects where bucket_id='notice-attachments' and name like 'schools/f1010101-1010-4101-8101-1000000000b1/%'),1,'D: admin B lists own-school attachments only');

select * from finish();
rollback;
