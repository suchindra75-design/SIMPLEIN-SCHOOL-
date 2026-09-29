-- SIMPLEIN SCHOOL ERP · Phase 12 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. Student self-access (students.user_id +
-- STUDENT role), promotion enrollments, and PYQs + pyqs bucket under test
-- (migration 0012). One transaction; rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 27 +
-- throws_matching(…) 10 = 37. RLS checks run `set local role authenticated`
-- + SET request.jwt.claims. Trigger/integrity assertions run as the connecting
-- role (bypasses RLS), so tenant triggers see every row and report real
-- mismatches. STUDENT is strictly read-only; enrollments/PYQ writes are
-- admin-only.

create extension if not exists pgtap;
begin;
select plan(37); -- 37 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f2121212-1212-4121-8121-0000000000a1','authenticated','authenticated','t12.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f2121212-1212-4121-8121-0000000000a2','authenticated','authenticated','t12.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f2121212-1212-4121-8121-0000000000a3','authenticated','authenticated','t12.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f2121212-1212-4121-8121-0000000000a4','authenticated','authenticated','t12.studentA1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f2121212-1212-4121-8121-0000000000a5','authenticated','authenticated','t12.studentA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f2121212-1212-4121-8121-0000000000b1','authenticated','authenticated','t12.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f2121212-1212-4121-8121-1000000000a1','Phase12 School A','phase12-school-a'),
  ('f2121212-1212-4121-8121-1000000000b1','Phase12 School B','phase12-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f2121212-1212-4121-8121-1100000000a2','f2121212-1212-4121-8121-1000000000a1','2027-28','2027-04-01','2028-03-31', false),
  ('f2121212-1212-4121-8121-1100000000b1','f2121212-1212-4121-8121-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f2121212-1212-4121-8121-2000000000a1','f2121212-1212-4121-8121-0000000000a1','f2121212-1212-4121-8121-1000000000a1','phase12.adminA@phase.tests','Admin A'),
  ('f2121212-1212-4121-8121-2000000000a2','f2121212-1212-4121-8121-0000000000a2','f2121212-1212-4121-8121-1000000000a1','phase12.teacherA@phase.tests','Teacher A'),
  ('f2121212-1212-4121-8121-2000000000a3','f2121212-1212-4121-8121-0000000000a3','f2121212-1212-4121-8121-1000000000a1','phase12.parentA@phase.tests','Parent A'),
  ('f2121212-1212-4121-8121-2000000000a4','f2121212-1212-4121-8121-0000000000a4','f2121212-1212-4121-8121-1000000000a1','phase12.studentA1@phase.tests','Student A1'),
  ('f2121212-1212-4121-8121-2000000000a5','f2121212-1212-4121-8121-0000000000a5','f2121212-1212-4121-8121-1000000000a1','phase12.studentA2@phase.tests','Student A2'),
  ('f2121212-1212-4121-8121-2000000000b1','f2121212-1212-4121-8121-0000000000b1','f2121212-1212-4121-8121-1000000000b1','phase12.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f2121212-1212-4121-8121-2000000000a1','SCHOOL_ADMIN'),
  ('f2121212-1212-4121-8121-2000000000a2','TEACHER'),
  ('f2121212-1212-4121-8121-2000000000a3','PARENT'),
  ('f2121212-1212-4121-8121-2000000000a4','STUDENT'),
  ('f2121212-1212-4121-8121-2000000000a5','STUDENT'),
  ('f2121212-1212-4121-8121-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-1000000000a1','Grade 7',7),
  ('f2121212-1212-4121-8121-3000000000a2','f2121212-1212-4121-8121-1000000000a1','Grade 8',8),
  ('f2121212-1212-4121-8121-3000000000b1','f2121212-1212-4121-8121-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.teachers (id, school_id, user_id, employee_no, first_name, display_name) values
  ('f2121212-1212-4121-8121-2000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-2000000000a2','E1','Ravi','Ravi')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, name, code) values
  ('f2121212-1212-4121-8121-4000000000a1','f2121212-1212-4121-8121-1000000000a1','Mathematics','MATH'),
  ('f2121212-1212-4121-8121-4000000000a2','f2121212-1212-4121-8121-1000000000a1','English','ENG'),
  ('f2121212-1212-4121-8121-4000000000b1','f2121212-1212-4121-8121-1000000000b1','Art','ART')
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name, class_teacher_id) values
  ('f2121212-1212-4121-8121-5000000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-3000000000a1','A','f2121212-1212-4121-8121-2000000000a2'),
  ('f2121212-1212-4121-8121-5000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-3000000000a2','A', null),
  ('f2121212-1212-4121-8121-5000000000b1','f2121212-1212-4121-8121-1000000000b1','f2121212-1212-4121-8121-3000000000b1','A', null)
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status, user_id) values
  ('f2121212-1212-4121-8121-6000000000a1','f2121212-1212-4121-8121-1000000000a1','1201','Sonia','P12','Sonia P12','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-5000000000a1','active','f2121212-1212-4121-8121-2000000000a4'),
  ('f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-1000000000a1','1202','Rahul','P12','Rahul P12','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-5000000000a1','active','f2121212-1212-4121-8121-2000000000a5'),
  ('f2121212-1212-4121-8121-6000000000b1','f2121212-1212-4121-8121-1000000000b1','B1201','Far','B','Far Child','f2121212-1212-4121-8121-3000000000b1','f2121212-1212-4121-8121-5000000000b1','active',null)
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f2121212-1212-4121-8121-2000000000a3','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-2000000000a3','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f2121212-1212-4121-8121-6000000000a1','f2121212-1212-4121-8121-2000000000a3','mother', true)
on conflict do nothing;

insert into public.student_enrollments (id, school_id, student_id, academic_year_id, class_id, section_id, status) values
  ('f2121212-1212-4121-8121-7000000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a1','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-5000000000a1','enrolled'),
  ('f2121212-1212-4121-8121-7000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-5000000000a1','enrolled'),
  ('f2121212-1212-4121-8121-7000000000b1','f2121212-1212-4121-8121-1000000000b1','f2121212-1212-4121-8121-6000000000b1','f2121212-1212-4121-8121-1100000000b1','f2121212-1212-4121-8121-3000000000b1','f2121212-1212-4121-8121-5000000000b1','enrolled')
on conflict (id) do nothing;

insert into public.attendance_sessions (id, school_id, academic_year_id, section_id, attendance_date, status) values
  ('f2121212-1212-4121-8121-7100000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-5000000000a1','2026-09-24','SUBMITTED')
on conflict (id) do nothing;

insert into public.attendance_records (id, school_id, attendance_session_id, student_id, status) values
  ('f2121212-1212-4121-8121-7200000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-7100000000a1','f2121212-1212-4121-8121-6000000000a1','PRESENT'),
  ('f2121212-1212-4121-8121-7200000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-7100000000a1','f2121212-1212-4121-8121-6000000000a2','ABSENT')
on conflict (id) do nothing;

insert into public.exams (id, school_id, academic_year_id, class_id, name, starts_on, ends_on) values
  ('f2121212-1212-4121-8121-8000000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-3000000000a1','Unit Test 1','2026-09-01','2026-09-30'),
  ('f2121212-1212-4121-8121-8000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-3000000000a1','Half-Yearly','2026-11-01','2026-11-30'),
  ('f2121212-1212-4121-8121-8000000000b1','f2121212-1212-4121-8121-1000000000b1','f2121212-1212-4121-8121-1100000000b1','f2121212-1212-4121-8121-3000000000b1','Final','2027-02-01','2027-02-28')
on conflict (id) do nothing;

insert into public.exam_subjects (id, school_id, exam_id, subject_id, max_marks, passing_marks, exam_date, is_locked, is_published) values
  ('f2121212-1212-4121-8121-8100000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8000000000a1','f2121212-1212-4121-8121-4000000000a1',100,33,'2026-09-10', false, true),
  ('f2121212-1212-4121-8121-8100000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8000000000a1','f2121212-1212-4121-8121-4000000000a2',100,33,'2026-09-12', false, false),
  ('f2121212-1212-4121-8121-8100000000b1','f2121212-1212-4121-8121-1000000000b1','f2121212-1212-4121-8121-8000000000b1','f2121212-1212-4121-8121-4000000000b1',50,17,'2027-02-05', false, true)
on conflict (id) do nothing;

insert into public.marks (id, school_id, exam_subject_id, student_id, marks_obtained) values
  ('f2121212-1212-4121-8121-8200000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8100000000a1','f2121212-1212-4121-8121-6000000000a1',80),
  ('f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8100000000a2','f2121212-1212-4121-8121-6000000000a1',70),
  ('f2121212-1212-4121-8121-6000000000a3','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8100000000a1','f2121212-1212-4121-8121-6000000000a2',60),
  ('f2121212-1212-4121-8121-8200000000b1','f2121212-1212-4121-8121-1000000000b1','f2121212-1212-4121-8121-8100000000b1','f2121212-1212-4121-8121-6000000000b1',30)
on conflict (id) do nothing;

insert into public.report_cards (id, school_id, exam_id, student_id, total_obtained, max_total, status) values
  ('f2121212-1212-4121-8121-8300000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8000000000a1','f2121212-1212-4121-8121-6000000000a1',80,100,'PUBLISHED'),
  ('f2121212-1212-4121-8121-8300000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8000000000a2','f2121212-1212-4121-8121-6000000000a1',70,100,'DRAFT')
on conflict (id) do nothing;

insert into public.fee_structures (id, school_id, academic_year_id, name) values
  ('f2121212-1212-4121-8121-8400000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-1100000000a1','Tuition 2026')
on conflict (id) do nothing;

insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount) values
  ('f2121212-1212-4121-8121-8500000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a1','f2121212-1212-4121-8121-8400000000a1',5000),
  ('f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-8400000000a1',5000)
on conflict (id) do nothing;

insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, recorded_by, verified_by) values
  ('f2121212-1212-4121-8121-8600000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8500000000a1',1000,'2026-09-05','CASH','f2121212-1212-4121-8121-2000000000a1','f2121212-1212-4121-8121-2000000000a1')
on conflict (id) do nothing;

insert into public.timetable_slots (id, school_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, period_index, starts_at, ends_at) values
  ('f2121212-1212-4121-8121-8700000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-5000000000a1','f2121212-1212-4121-8121-4000000000a1','f2121212-1212-4121-8121-2000000000a2',1,0,'09:00','09:40')
on conflict (id) do nothing;

insert into public.homework (id, school_id, academic_year_id, section_id, subject_id, teacher_id, title, description, assigned_on, due_date) values
  ('f2121212-1212-4121-8121-8800000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-1100000000a1','f2121212-1212-4121-8121-5000000000a1','f2121212-1212-4121-8121-4000000000a1','f2121212-1212-4121-8121-2000000000a2','Fractions HW','Do pages 1-3','2026-09-01','2026-09-08')
on conflict (id) do nothing;

insert into public.notices (id, school_id, title, content, category, is_published, created_by) values
  ('f2121212-1212-4121-8121-8900000000a1','f2121212-1212-4121-8121-1000000000a1','School Fair','Fair on Saturday','GENERAL', true,'f2121212-1212-4121-8121-2000000000a1'),
  ('f2121212-1212-4121-8121-8900000000a2','f2121212-1212-4121-8121-1000000000a1','Staff Meeting','Room 3 at 2pm','GENERAL', true,'f2121212-1212-4121-8121-2000000000a1'),
  ('f2121212-1212-4121-8121-8900000000a3','f2121212-1212-4121-8121-1000000000a1','Holiday','School closed Monday','GENERAL', true,'f2121212-1212-4121-8121-2000000000a1')
on conflict (id) do nothing;

insert into public.notice_targets (school_id, notice_id, audience_type, class_id, section_id) values
  ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8900000000a2','SECTION',null,'f2121212-1212-4121-8121-5000000000a1'),
  ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8900000000a1','TEACHERS',null,null)
on conflict do nothing;

insert into public.notifications (id, school_id, user_id, type, title, message) values
  ('f2121212-1212-4121-8121-9000000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-2000000000a4','ACCOUNT','Welcome','Portal access enabled'),
  ('f2121212-1212-4121-8121-9000000000a2','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-2000000000a2','NOTICE','Cover duty','Period 3 cover')
on conflict (id) do nothing;

insert into public.pyqs (id, school_id, class_id, subject_id, year_label, exam_board_name, file_bucket, file_path, file_name, file_mime, file_bytes, uploaded_by) values
  ('f2121212-1212-4121-8121-9100000000a1','f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-4000000000a1','2024','CBSE 2024','pyqs','schools/f2121212-1212-4121-8121-1000000000a1/pyqs/math-2024.pdf','math-2024.pdf','application/pdf',500,'f2121212-1212-4121-8121-2000000000a1'),
  ('f2121212-1212-4121-8121-9100000000b1','f2121212-1212-4121-8121-1000000000b1','f2121212-1212-4121-8121-3000000000b1','f2121212-1212-4121-8121-4000000000b1','2024','State 2024','pyqs','schools/f2121212-1212-4121-8121-1000000000b1/pyqs/art-2024.pdf','art-2024.pdf','application/pdf',400,'f2121212-1212-4121-8121-2000000000b1')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('pyqs', 'schools/f2121212-1212-4121-8121-1000000000a1/pyqs/math-2024.pdf'),
  ('pyqs', 'schools/f2121212-1212-4121-8121-1000000000b1/pyqs/art-2024.pdf');

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Student self-access (own data only — s2 same-section invisible).
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a4"}';
select is((select count(*)::int from public.students),1,'A: student reads only own row');
select is((select count(*)::int from public.students where id='f2121212-1212-4121-8121-6000000000a2'),0,'A: same-section peer invisible');
select is((select count(*)::int from public.student_enrollments where student_id='f2121212-1212-4121-8121-6000000000a1'),1,'A: student reads own enrollment history');
select is((select count(*)::int from public.attendance_records where student_id='f2121212-1212-4121-8121-6000000000a1'),1,'A: student reads own attendance');
select is((select count(*)::int from public.student_fees where student_id='f2121212-1212-4121-8121-6000000000a1'),1,'A: student reads own fees');
select is((select count(*)::int from public.timetable_slots where section_id='f2121212-1212-4121-8121-5000000000a1'),1,'A: student reads own-section timetable');
select is((select count(*)::int from public.homework where section_id='f2121212-1212-4121-8121-5000000000a1'),1,'A: student reads own-section homework');

-- B. Published-only gating (marks + report cards). Migration 0013 fixed the
-- student branch via exam_subject_is_published(): own PUBLISHED marks read,
-- everything else stays invisible (unpublished own, peer's, cross-school).
select is((select count(*)::int from public.marks where student_id='f2121212-1212-4121-8121-6000000000a1'),1,'B: student reads own published marks');
select is((select count(*)::int from public.marks where exam_subject_id='f2121212-1212-4121-8121-8100000000a2'),0,'B: student reads zero unpublished marks');
select is((select count(*)::int from public.marks where student_id='f2121212-1212-4121-8121-6000000000a2'),0,'B: another student published marks denied');
select is((select count(*)::int from public.marks where school_id='f2121212-1212-4121-8121-1000000000b1'),0,'B: cross-school marks denied');
select is((select count(*)::int from public.report_cards where student_id='f2121212-1212-4121-8121-6000000000a1'),1,'B: student reads only own published cards');
select is((select count(*)::int from public.report_cards where status='DRAFT'),0,'B: student reads zero DRAFT cards');
-- Exam subjects are invisible to students at RLS, so the marks tenant trigger
-- reports the reference (same layering as phase6 C2/C3).
select throws_matching(
  $$ insert into public.marks (school_id, exam_subject_id, student_id, marks_obtained) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-8100000000a1','f2121212-1212-4121-8121-6000000000a1',90) $$,
  'does not exist','B: student cannot insert marks (read-only role)');

-- C. Promotion (admin-only writes; duplicate enrollment blocked; pointers move).
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a4"}';
select throws_matching(
  $$ insert into public.student_enrollments (school_id, student_id, academic_year_id, class_id, section_id) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a1','f2121212-1212-4121-8121-1100000000a2','f2121212-1212-4121-8121-3000000000a2','f2121212-1212-4121-8121-5000000000a2') $$,
  'row-level security policy','C: student cannot self-enroll (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a2"}';
select throws_matching(
  $$ insert into public.student_enrollments (school_id, student_id, academic_year_id, class_id, section_id) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a1','f2121212-1212-4121-8121-1100000000a2','f2121212-1212-4121-8121-3000000000a2','f2121212-1212-4121-8121-5000000000a2') $$,
  'row-level security policy','C: teacher cannot enroll students (admin-only writes)');
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a1"}';
-- Promotion moves s2 (s1's placement stays stable for the later student reads).
insert into public.student_enrollments (school_id, student_id, academic_year_id, class_id, section_id) values
  ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-1100000000a2','f2121212-1212-4121-8121-3000000000a2','f2121212-1212-4121-8121-5000000000a2');
select is((select count(*)::int from public.student_enrollments where student_id='f2121212-1212-4121-8121-6000000000a2' and academic_year_id='f2121212-1212-4121-8121-1100000000a2'),1,'C: admin promotes with a next-year enrollment row');
update public.students set class_id='f2121212-1212-4121-8121-3000000000a2', section_id='f2121212-1212-4121-8121-5000000000a2' where id='f2121212-1212-4121-8121-6000000000a2';
select is((select count(*)::int from public.students where id='f2121212-1212-4121-8121-6000000000a2' and class_id='f2121212-1212-4121-8121-3000000000a2'),1,'C: admin repoints current placement on promote');
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000b1"}';
select is((select count(*)::int from public.student_enrollments where school_id='f2121212-1212-4121-8121-1000000000a1'),0,'C: admin B sees zero School A enrollments');

-- D. PYQs: same-school reads; admin-only writes; private bucket.
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a4"}';
select is((select count(*)::int from public.pyqs where school_id='f2121212-1212-4121-8121-1000000000a1'),1,'D: student reads own-school PYQ bank');
select is((select count(*)::int from public.pyqs where id='f2121212-1212-4121-8121-9100000000b1'),0,'D: student reads zero School B PYQs');
select throws_matching(
  $$ insert into public.pyqs (school_id, class_id, subject_id, year_label, exam_board_name, file_bucket, file_path, file_name, file_mime, file_bytes, uploaded_by) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-4000000000a1','2023','CBSE 2023','pyqs','schools/x.pdf','x.pdf','application/pdf',100,'f2121212-1212-4121-8121-2000000000a4') $$,
  'row-level security policy','D: student cannot upload PYQs (admin-only writes)');
update public.pyqs set title = 'Hacked' where id = 'f2121212-1212-4121-8121-9100000000a1';
select is((select count(*)::int from public.pyqs where title = 'Hacked'),0,'D: student cannot edit PYQs (update filtered)');
select is((select count(*)::int from storage.objects where bucket_id='pyqs' and name like 'schools/f2121212-1212-4121-8121-1000000000a1/%'),1,'D: student downloads own-school PYQ paths');

-- ------------------------- trigger assertions (connecting role) -------------------------
reset role;

select throws_matching(
  $$ insert into public.students (school_id, admission_no, first_name, display_name, class_id, section_id, user_id) values
      ('f2121212-1212-4121-8121-1000000000a1','X99','X','X','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-5000000000a1','f2121212-1212-4121-8121-2000000000b1') $$,
  'cross-tenant reference: users','E: student login cannot link another-school user');
select throws_matching(
  $$ insert into public.students (school_id, admission_no, first_name, display_name, class_id, section_id, user_id) values
      ('f2121212-1212-4121-8121-1000000000a1','X98','X','X','f2121212-1212-4121-8121-3000000000a1','f2121212-1212-4121-8121-5000000000a1','f2121212-1212-4121-8121-2000000000a4') $$,
  'duplicate key value','E: one login per student enforced (user_id UNIQUE)');
select throws_matching(
  $$ insert into public.pyqs (school_id, class_id, subject_id, year_label, exam_board_name, file_bucket, file_path, file_name, file_mime, file_bytes, uploaded_by) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-3000000000b1','f2121212-1212-4121-8121-4000000000a1','2023','CBSE 2023','pyqs','schools/y.pdf','y.pdf','application/pdf',100,'f2121212-1212-4121-8121-2000000000a1') $$,
  'cross-tenant reference: classes','E: PYQ cannot reference another-school class');
select throws_matching(
  $$ update public.students set school_id='f2121212-1212-4121-8121-1000000000b1'
      where id='f2121212-1212-4121-8121-6000000000a1' $$,
  'school_id is immutable','E: school_id can never change on a student row');

-- ------------------------- student inbox + notices -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a4"}';
select is((select count(*)::int from public.notifications),1,'F: student reads only own inbox row');
update public.notifications set is_read = true where user_id = 'f2121212-1212-4121-8121-2000000000a2';
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a2"}';
select is((select count(*)::int from public.notifications where user_id='f2121212-1212-4121-8121-2000000000a2' and is_read = false),1,'F: student cannot mark-read another inbox (row retained unread)');
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a4"}';
select throws_matching(
  $$ insert into public.notifications (school_id, user_id, type, title, message) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-2000000000a4','NOTICE','X','X') $$,
  'row-level security policy','F: student cannot fan-out notifications (read-only role)');
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a4"}';
select is((select count(*)::int from public.notices),2,'F: student reads school-wide + own-section notices');
select is((select count(*)::int from public.notices where id='f2121212-1212-4121-8121-8900000000a1'),0,'F: student reads zero TEACHERS-channel notices');
-- As the student the RLS denial would fire first; as admin the idempotency
-- guard itself is exercised.
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a1"}';
select throws_matching(
  $$ insert into public.student_enrollments (school_id, student_id, academic_year_id, class_id, section_id) values
      ('f2121212-1212-4121-8121-1000000000a1','f2121212-1212-4121-8121-6000000000a2','f2121212-1212-4121-8121-1100000000a2','f2121212-1212-4121-8121-3000000000a2','f2121212-1212-4121-8121-5000000000a2') $$,
  'duplicate key value','F: promotion is idempotent-guarded (UNIQUE student+year)');

-- ------------------------- storage assertions -------------------------
reset role;
select is((select public from storage.buckets where id = 'pyqs'), false, 'D: pyqs bucket is private (signed URLs only)');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f2121212-1212-4121-8121-0000000000a1"}';
select is((select count(*)::int from storage.objects where bucket_id='pyqs' and name like 'schools/f2121212-1212-4121-8121-1000000000a1/%'),1,'D: admin A lists own-school PYQ files only');
select is((select count(*)::int from storage.objects where bucket_id='pyqs' and name like 'schools/f2121212-1212-4121-8121-1000000000b1/%'),0,'D: admin A lists zero School B PYQ files');

select * from finish();
rollback;
