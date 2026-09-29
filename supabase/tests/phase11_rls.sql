-- SIMPLEIN SCHOOL ERP · Phase 11 live pgTAP RLS suite.
-- Conventions: see phase2_rls.sql. fee_structures + fee_components +
-- student_fees + fee_payment_records + the fee-receipts bucket under test
-- (migration 0011, RECORDS-ONLY model — no payment processing anywhere).
-- One transaction; rolls back at the end.
-- Assertion calls (count must match the plan below): is(…) 20 +
-- throws_matching(…) 12 = 32. RLS checks run `set local role authenticated`
-- + SET request.jwt.claims. Trigger/integrity assertions run as the connecting
-- role (bypasses RLS), so tenant triggers see every row and report real
-- mismatches. Structures/components are same-school readable (parents see
-- assigned structures via the service scope); maker-checker verify/void is
-- service-enforced and unit-tested.

create extension if not exists pgtap;
begin;
select plan(32); -- 32 assertions

-- ------------------------- fixture -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','f1f1f1f1-f1f1-41f1-81f1-0000000000a1','authenticated','authenticated','t11.adminA1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1f1f1f1-f1f1-41f1-81f1-0000000000a2','authenticated','authenticated','t11.adminA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1f1f1f1-f1f1-41f1-81f1-0000000000a3','authenticated','authenticated','t11.parentA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1f1f1f1-f1f1-41f1-81f1-0000000000a4','authenticated','authenticated','t11.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','f1f1f1f1-f1f1-41f1-81f1-0000000000b1','authenticated','authenticated','t11.admB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','Phase11 School A','phase11-school-a'),
  ('f1f1f1f1-f1f1-41f1-81f1-1000000000b1','Phase11 School B','phase11-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('f1f1f1f1-f1f1-41f1-81f1-1100000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('f1f1f1f1-f1f1-41f1-81f1-1100000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a1','f1f1f1f1-f1f1-41f1-81f1-0000000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','phase11.adminA1@phase.tests','Admin A1'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a2','f1f1f1f1-f1f1-41f1-81f1-0000000000a2','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','phase11.adminA2@phase.tests','Admin A2'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a3','f1f1f1f1-f1f1-41f1-81f1-0000000000a3','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','phase11.parentA@phase.tests','Parent A'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a4','f1f1f1f1-f1f1-41f1-81f1-0000000000a4','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','phase11.teacherA@phase.tests','Teacher A'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000b1','f1f1f1f1-f1f1-41f1-81f1-0000000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','phase11.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a1','SCHOOL_ADMIN'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a2','SCHOOL_ADMIN'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a3','PARENT'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a4','TEACHER'),
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('f1f1f1f1-f1f1-41f1-81f1-3000000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','Grade 7',7),
  ('f1f1f1f1-f1f1-41f1-81f1-3000000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name) values
  ('f1f1f1f1-f1f1-41f1-81f1-5000000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-3000000000a1','A'),
  ('f1f1f1f1-f1f1-41f1-81f1-5000000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','f1f1f1f1-f1f1-41f1-81f1-3000000000b1','A')
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('f1f1f1f1-f1f1-41f1-81f1-6000000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','1101','Sonia','P11','Sonia P11','f1f1f1f1-f1f1-41f1-81f1-3000000000a1','f1f1f1f1-f1f1-41f1-81f1-5000000000a1','active'),
  ('f1f1f1f1-f1f1-41f1-81f1-6000000000a2','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','1102','Rahul','P11','Rahul P11','f1f1f1f1-f1f1-41f1-81f1-3000000000a1','f1f1f1f1-f1f1-41f1-81f1-5000000000a1','active'),
  ('f1f1f1f1-f1f1-41f1-81f1-6000000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','B1101','Far','B','Far Child','f1f1f1f1-f1f1-41f1-81f1-3000000000b1','f1f1f1f1-f1f1-41f1-81f1-5000000000b1','active')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('f1f1f1f1-f1f1-41f1-81f1-2000000000a3','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-2000000000a3','Parent A')
on conflict (id) do nothing;

insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('f1f1f1f1-f1f1-41f1-81f1-6000000000a1','f1f1f1f1-f1f1-41f1-81f1-2000000000a3','mother', true)
on conflict do nothing;

insert into public.fee_structures (id, school_id, academic_year_id, class_id, name, due_date) values
  ('f1f1f1f1-f1f1-41f1-81f1-7000000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-1100000000a1','f1f1f1f1-f1f1-41f1-81f1-3000000000a1','Tuition 2026','2026-09-30'),
  ('f1f1f1f1-f1f1-41f1-81f1-7000000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','f1f1f1f1-f1f1-41f1-81f1-1100000000b1','f1f1f1f1-f1f1-41f1-81f1-3000000000b1','Tuition 2026','2026-09-30')
on conflict (id) do nothing;

insert into public.fee_components (id, school_id, fee_structure_id, name, amount) values
  ('f1f1f1f1-f1f1-41f1-81f1-7100000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1','Tuition',5000),
  ('f1f1f1f1-f1f1-41f1-81f1-7100000000a2','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1','Transport',2000)
on conflict (id) do nothing;

insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount, due_date) values
  ('f1f1f1f1-f1f1-41f1-81f1-7200000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-6000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1',6500,'2026-09-30'),
  ('f1f1f1f1-f1f1-41f1-81f1-7200000000a2','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-6000000000a2','f1f1f1f1-f1f1-41f1-81f1-7000000000a1',7000,'2026-09-30'),
  ('f1f1f1f1-f1f1-41f1-81f1-7200000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','f1f1f1f1-f1f1-41f1-81f1-6000000000b1','f1f1f1f1-f1f1-41f1-81f1-7000000000b1',5000,'2026-09-30')
on conflict (id) do nothing;

insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, reference_no, recorded_by, verified_by, is_voided, void_reason, receipt_bucket, receipt_path, receipt_name, receipt_mime, receipt_bytes) values
  ('f1f1f1f1-f1f1-41f1-81f1-7300000000a1','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000a1',2000,'2026-09-05','CASH','C1','f1f1f1f1-f1f1-41f1-81f1-2000000000a1','f1f1f1f1-f1f1-41f1-81f1-2000000000a2',false,null,'fee-receipts','schools/f1f1f1f1-f1f1-41f1-81f1-1000000000a1/fee-receipts/r1.pdf','r1.pdf','application/pdf',300),
  ('f1f1f1f1-f1f1-41f1-81f1-7300000000a2','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000a1',1000,'2026-09-06','CHEQUE','C2','f1f1f1f1-f1f1-41f1-81f1-2000000000a1',null,false,null,null,null,null,null,null),
  ('f1f1f1f1-f1f1-41f1-81f1-7300000000a3','f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000a1',500,'2026-09-07','CASH','C3','f1f1f1f1-f1f1-41f1-81f1-2000000000a1','f1f1f1f1-f1f1-41f1-81f1-2000000000a2',true,'entered twice',null,null,null,null,null),
  ('f1f1f1f1-f1f1-41f1-81f1-7300000000b1','f1f1f1f1-f1f1-41f1-81f1-1000000000b1','f1f1f1f1-f1f1-41f1-81f1-7200000000b1',1500,'2026-09-05','CASH','CB1','f1f1f1f1-f1f1-41f1-81f1-2000000000b1','f1f1f1f1-f1f1-41f1-81f1-2000000000b1',false,null,null,null,null,null,null)
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values
  ('fee-receipts', 'schools/f1f1f1f1-f1f1-41f1-81f1-1000000000a1/fee-receipts/r1.pdf'),
  ('fee-receipts', 'schools/f1f1f1f1-f1f1-41f1-81f1-1000000000b1/fee-receipts/rb.pdf');

-- ------------------------- RLS assertions -------------------------
set local role authenticated;

-- A. Tenant isolation — School A fees: A→A allowed, A→B denied.
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a1"}';
select is((select count(*)::int from public.fee_structures where school_id='f1f1f1f1-f1f1-41f1-81f1-1000000000a1'),1,'A: admin A1 sees own fee structure');
select is((select count(*)::int from public.fee_structures where school_id='f1f1f1f1-f1f1-41f1-81f1-1000000000b1'),0,'A: admin A1 sees zero School B structures');
select is((select count(*)::int from public.student_fees where school_id='f1f1f1f1-f1f1-41f1-81f1-1000000000a1'),2,'A: admin A1 sees both School A assignments');
select is((select count(*)::int from public.student_fees where id='f1f1f1f1-f1f1-41f1-81f1-7200000000b1'),0,'A: admin A1 sees zero School B assignments');
select is((select count(*)::int from public.fee_payment_records where school_id='f1f1f1f1-f1f1-41f1-81f1-1000000000a1'),3,'A: admin A1 sees all School A records (incl. unverified + voided)');
update public.fee_structures set name = 'x' where id = 'f1f1f1f1-f1f1-41f1-81f1-7000000000b1';
select is((select count(*)::int from public.fee_structures where name = 'x'),0,'A: admin A1 update of School B structure had zero effect');

-- B. Parent scope (linked to s1 only; non-voided records only).
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a3"}';
select is((select count(*)::int from public.student_fees where student_id='f1f1f1f1-f1f1-41f1-81f1-6000000000a1'),1,'B: parent sees linked-child assignment');
select is((select count(*)::int from public.student_fees where student_id='f1f1f1f1-f1f1-41f1-81f1-6000000000a2'),0,'B: parent sees zero unlinked-child assignments');
select is((select count(*)::int from public.fee_payment_records where student_fee_id='f1f1f1f1-f1f1-41f1-81f1-7200000000a1'),2,'B: parent sees linked non-voided records (verified + pending)');
select is((select count(*)::int from public.fee_payment_records where is_voided = true),0,'B: parent sees zero voided records');
select throws_matching(
  $$ insert into public.fee_components (school_id, fee_structure_id, name, amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1','X',100) $$,
  'row-level security policy','B: parent cannot insert fee components (read-only)');
update public.student_fees set due_date = '2026-12-31' where id = 'f1f1f1f1-f1f1-41f1-81f1-7200000000a1';
select is((select count(*)::int from public.student_fees where id='f1f1f1f1-f1f1-41f1-81f1-7200000000a1' and due_date='2026-09-30'),1,'B: parent cannot modify assignments (due date unchanged)');

-- E. Teacher scope: structures are same-school readable (service scopes fees);
-- writes are admin-only.
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a4"}';
select is((select count(*)::int from public.fee_structures where school_id='f1f1f1f1-f1f1-41f1-81f1-1000000000a1'),1,'E: teacher reads same-school structures (service hides fees)');
select throws_matching(
  $$ insert into public.fee_components (school_id, fee_structure_id, name, amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1','X',100) $$,
  'row-level security policy','E: teacher cannot insert fee components (no fees role)');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000a1',100,'2026-09-10','CASH','f1f1f1f1-f1f1-41f1-81f1-2000000000a4') $$,
  'does not exist','E: teacher cannot record receipts for invisible assignments (denied)');

-- ------------------------- trigger assertions (connecting role) -------------------------
reset role;

select throws_matching(
  $$ insert into public.fee_components (school_id, fee_structure_id, name, amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000b1','X',100) $$,
  'cross-tenant reference: fee_structures','D: cross-tenant structure reference rejected');
select throws_matching(
  $$ insert into public.student_fees (school_id, student_id, fee_structure_id, total_amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-6000000000b1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1',1000) $$,
  'cross-tenant reference: students','D: cross-tenant student reference rejected');
select throws_matching(
  $$ insert into public.student_fees (school_id, student_id, fee_structure_id, total_amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-6000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000b1',1000) $$,
  'cross-tenant reference: fee_structures','D: cross-tenant structure reference rejected');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000b1',100,'2026-09-10','CASH','f1f1f1f1-f1f1-41f1-81f1-2000000000a1') $$,
  'cross-tenant reference: student_fees','D: cross-tenant assignment reference rejected');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000a1',0,'2026-09-10','CASH','f1f1f1f1-f1f1-41f1-81f1-2000000000a1') $$,
  'violates check constraint','D: zero amount rejected (CHECK)');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7200000000a1',100,'2026-09-10','UPI','f1f1f1f1-f1f1-41f1-81f1-2000000000a1') $$,
  'violates check constraint','D: unknown mode rejected (CHECK)');
select throws_matching(
  $$ insert into public.fee_components (school_id, fee_structure_id, name, amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1','X',-100) $$,
  'violates check constraint','D: negative component rejected (CHECK)');
select throws_matching(
  $$ insert into public.student_fees (school_id, student_id, fee_structure_id, total_amount) values
      ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-6000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1',1000) $$,
  'duplicate key value','D: duplicate assignment prevented (UNIQUE student+structure)');
select throws_matching(
  $$ update public.student_fees set school_id='f1f1f1f1-f1f1-41f1-81f1-1000000000b1'
      where id='f1f1f1f1-f1f1-41f1-81f1-7200000000a1' $$,
  'school_id is immutable','D: school_id can never change on an assignment row');

-- ------------------------- modification authorization -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a4"}';
delete from public.fee_payment_records where id = 'f1f1f1f1-f1f1-41f1-81f1-7300000000a1';
-- Neither role can observe the row (teachers/B-admins see zero fee records),
-- so admin A1 — who sees all own-school rows — verifies retention.
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a1"}';
select is((select count(*)::int from public.fee_payment_records where id='f1f1f1f1-f1f1-41f1-81f1-7300000000a1'),1,'F: teacher cannot delete receipts (record retained)');
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a1"}';
insert into public.fee_components (school_id, fee_structure_id, name, amount) values
  ('f1f1f1f1-f1f1-41f1-81f1-1000000000a1','f1f1f1f1-f1f1-41f1-81f1-7000000000a1','Lab',500);
select is((select count(*)::int from public.fee_components where name='Lab'),1,'F: admin A1 inserts an own-school component');
update public.student_fees set due_date = '2026-10-31' where id = 'f1f1f1f1-f1f1-41f1-81f1-7200000000a1';
select is((select count(*)::int from public.student_fees where id='f1f1f1f1-f1f1-41f1-81f1-7200000000a1' and due_date='2026-10-31'),1,'F: admin A1 updates an own-school assignment');
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000b1"}';
update public.student_fees set total_amount = 0 where id = 'f1f1f1f1-f1f1-41f1-81f1-7200000000a1';
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a1"}';
select is((select count(*)::int from public.student_fees where id='f1f1f1f1-f1f1-41f1-81f1-7200000000a1' and total_amount=6500),1,'F: admin B update of School A assignment had zero effect');

-- ------------------------- storage assertions -------------------------
reset role;
select is((select public from storage.buckets where id = 'fee-receipts'), false, 'C: fee-receipts bucket is private (signed URLs only)');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000a1"}';
select is((select count(*)::int from storage.objects where bucket_id='fee-receipts' and name like 'schools/f1f1f1f1-f1f1-41f1-81f1-1000000000a1/%'),1,'C: admin A1 lists own-school receipts only');
select is((select count(*)::int from storage.objects where bucket_id='fee-receipts' and name like 'schools/f1f1f1f1-f1f1-41f1-81f1-1000000000b1/%'),0,'C: admin A1 lists zero School B receipts');
set local "request.jwt.claims" = '{"sub":"f1f1f1f1-f1f1-41f1-81f1-0000000000b1"}';
select is((select count(*)::int from storage.objects where bucket_id='fee-receipts' and name like 'schools/f1f1f1f1-f1f1-41f1-81f1-1000000000b1/%'),1,'C: admin B lists own-school receipts only');

select * from finish();
rollback;
