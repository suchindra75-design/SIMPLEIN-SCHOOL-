-- SIMPLEIN SCHOOL ERP · Fee payment integrity (migration 0022) pgTAP suite.
-- Proves that request-level callers (role `authenticated`, i.e. the Supabase
-- API with a user session) cannot bypass maker-checker, edit amounts, delete
-- records or skip the audit trail, while legitimate second-admin verification
-- still works. Trusted paths (service role, direct DB) stay possible and are
-- audited. One transaction; rolls back at the end.

create extension if not exists pgtap;
begin;
select plan(42);

-- ------------------------- fixture (connecting role) -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','fe22fe22-fe22-4e22-8e22-0000000000a1','authenticated','authenticated','fi.adminA1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','fe22fe22-fe22-4e22-8e22-0000000000a2','authenticated','authenticated','fi.adminA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','fe22fe22-fe22-4e22-8e22-0000000000a4','authenticated','authenticated','fi.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','fe22fe22-fe22-4e22-8e22-0000000000b1','authenticated','authenticated','fi.adminB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('fe22fe22-fe22-4e22-8e22-1000000000a1','FeeInt School A','feeint-school-a'),
  ('fe22fe22-fe22-4e22-8e22-1000000000b1','FeeInt School B','feeint-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('fe22fe22-fe22-4e22-8e22-1100000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('fe22fe22-fe22-4e22-8e22-1100000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('fe22fe22-fe22-4e22-8e22-2000000000a1','fe22fe22-fe22-4e22-8e22-0000000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','fi.adminA1@phase.tests','Admin A1'),
  ('fe22fe22-fe22-4e22-8e22-2000000000a2','fe22fe22-fe22-4e22-8e22-0000000000a2','fe22fe22-fe22-4e22-8e22-1000000000a1','fi.adminA2@phase.tests','Admin A2'),
  ('fe22fe22-fe22-4e22-8e22-2000000000a4','fe22fe22-fe22-4e22-8e22-0000000000a4','fe22fe22-fe22-4e22-8e22-1000000000a1','fi.teacherA@phase.tests','Teacher A'),
  ('fe22fe22-fe22-4e22-8e22-2000000000b1','fe22fe22-fe22-4e22-8e22-0000000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','fi.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('fe22fe22-fe22-4e22-8e22-2000000000a1','SCHOOL_ADMIN'),
  ('fe22fe22-fe22-4e22-8e22-2000000000a2','SCHOOL_ADMIN'),
  ('fe22fe22-fe22-4e22-8e22-2000000000a4','TEACHER'),
  ('fe22fe22-fe22-4e22-8e22-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('fe22fe22-fe22-4e22-8e22-3000000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','Grade 7',7),
  ('fe22fe22-fe22-4e22-8e22-3000000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name) values
  ('fe22fe22-fe22-4e22-8e22-5000000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-3000000000a1','A'),
  ('fe22fe22-fe22-4e22-8e22-5000000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','fe22fe22-fe22-4e22-8e22-3000000000b1','A')
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('fe22fe22-fe22-4e22-8e22-6000000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','FI-1','Asha','FI','Asha FI','fe22fe22-fe22-4e22-8e22-3000000000a1','fe22fe22-fe22-4e22-8e22-5000000000a1','active'),
  ('fe22fe22-fe22-4e22-8e22-6000000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','FI-B1','Bina','FI','Bina FI','fe22fe22-fe22-4e22-8e22-3000000000b1','fe22fe22-fe22-4e22-8e22-5000000000b1','active')
on conflict (id) do nothing;

insert into public.fee_structures (id, school_id, academic_year_id, class_id, name, due_date) values
  ('fe22fe22-fe22-4e22-8e22-7000000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-1100000000a1','fe22fe22-fe22-4e22-8e22-3000000000a1','Tuition','2026-09-30'),
  ('fe22fe22-fe22-4e22-8e22-7000000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','fe22fe22-fe22-4e22-8e22-1100000000b1','fe22fe22-fe22-4e22-8e22-3000000000b1','Tuition','2026-09-30')
on conflict (id) do nothing;

insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount) values
  ('fe22fe22-fe22-4e22-8e22-7200000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-6000000000a1','fe22fe22-fe22-4e22-8e22-7000000000a1',5000),
  ('fe22fe22-fe22-4e22-8e22-7200000000b1','fe22fe22-fe22-4e22-8e22-1000000000b1','fe22fe22-fe22-4e22-8e22-6000000000b1','fe22fe22-fe22-4e22-8e22-7000000000b1',4000)
on conflict (id) do nothing;

-- ------------------------- A1 (maker) via the API role -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"fe22fe22-fe22-4e22-8e22-0000000000a1","role":"authenticated"}';

select is(public.fee_request_caller(), 'api_user', 'caller: authenticated session is a guarded API caller');

select lives_ok(
  $$ insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, reference_no, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-7300000000a1','fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',2000,'2026-09-05','CASH','R-1','fe22fe22-fe22-4e22-8e22-2000000000a1') $$,
  'record: A1 records a 2000 payment in own name');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',100,'2026-09-05','CASH','fe22fe22-fe22-4e22-8e22-2000000000a2') $$,
  'recorded in your own name', 'record: cannot record a payment in another admin''s name');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by, verified_by)
     values ('fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',100,'2026-09-05','CASH','fe22fe22-fe22-4e22-8e22-2000000000a1','fe22fe22-fe22-4e22-8e22-2000000000a2') $$,
  'already verified', 'record: cannot insert a pre-verified payment');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by, is_voided, void_reason)
     values ('fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',100,'2026-09-05','CASH','fe22fe22-fe22-4e22-8e22-2000000000a1',true,'x') $$,
  'as voided', 'record: cannot insert a voided payment');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',3500,'2026-09-06','CASH','fe22fe22-fe22-4e22-8e22-2000000000a1') $$,
  'exceeds the outstanding balance \(3000', 'record: overpayment rejected (balance 3000)');

select throws_matching(
  $$ update public.fee_payment_records set verified_by = 'fe22fe22-fe22-4e22-8e22-2000000000a1' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'Another admin must verify', 'verify: the maker cannot verify own payment');
select throws_matching(
  $$ update public.fee_payment_records set verified_by = 'fe22fe22-fe22-4e22-8e22-2000000000a2' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'verified in your own name', 'verify: the maker cannot mark it verified by another admin');
select throws_matching(
  $$ update public.fee_payment_records set amount = 1 where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be changed after recording', 'tamper: amount cannot be edited');
select throws_matching(
  $$ update public.fee_payment_records set paid_on = '2026-01-01' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be changed after recording', 'tamper: payment date cannot be edited');
select throws_matching(
  $$ update public.fee_payment_records set recorded_by = 'fe22fe22-fe22-4e22-8e22-2000000000a2' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be changed after recording', 'tamper: the recorder cannot be reassigned (maker-checker swap)');
select throws_matching(
  $$ delete from public.fee_payment_records where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be deleted', 'delete: a payment record cannot be deleted');
select throws_matching(
  $$ delete from public.student_fees where id = 'fe22fe22-fe22-4e22-8e22-7200000000a1' $$,
  'cannot be deleted', 'delete: deleting the assignment cannot cascade-delete payments');
select throws_matching(
  $$ delete from public.fee_structures where id = 'fe22fe22-fe22-4e22-8e22-7000000000a1' $$,
  'cannot be deleted', 'delete: deleting the fee structure cannot cascade-delete payments');
select throws_matching(
  $$ update public.student_fees set total_amount = 1000 where id = 'fe22fe22-fe22-4e22-8e22-7200000000a1' $$,
  'cannot be set below', 'total: assignment total cannot drop below what was paid');
select lives_ok(
  $$ update public.student_fees set total_amount = 6000 where id = 'fe22fe22-fe22-4e22-8e22-7200000000a1' $$,
  'total: raising the assignment total is allowed');
update public.student_fees set total_amount = 5000 where id = 'fe22fe22-fe22-4e22-8e22-7200000000a1';
select lives_ok(
  $$ update public.fee_payment_records set receipt_bucket = 'fee-receipts', receipt_path = 'schools/fe22fe22-fe22-4e22-8e22-1000000000a1/fee-receipts/r1.pdf', receipt_name = 'r1.pdf', receipt_mime = 'application/pdf', receipt_bytes = 100
     where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'receipt: a receipt can be attached');
select throws_matching(
  $$ update public.fee_payment_records set is_voided = true, void_reason = 'mine' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'Another admin must void', 'void: the maker cannot void own payment');

-- ------------------------- A2 (checker) -------------------------
set local "request.jwt.claims" = '{"sub":"fe22fe22-fe22-4e22-8e22-0000000000a2","role":"authenticated"}';
select lives_ok(
  $$ update public.fee_payment_records set verified_by = 'fe22fe22-fe22-4e22-8e22-2000000000a2' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'verify: a second admin verifies in own name');
select is(
  (select verified_by from public.fee_payment_records where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1'),
  'fe22fe22-fe22-4e22-8e22-2000000000a2'::uuid, 'verify: verified_by is the checker');
select throws_matching(
  $$ update public.fee_payment_records set verified_by = null where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be changed or removed', 'verify: a verification cannot be removed');
select throws_matching(
  $$ update public.fee_payment_records set amount = 5000 where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be changed after recording', 'tamper: the checker cannot edit the amount either');
select throws_matching(
  $$ update public.fee_payment_records set is_voided = true where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'reason is required', 'void: a reason is required');
select lives_ok(
  $$ update public.fee_payment_records set is_voided = true, void_reason = 'entered twice' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'void: a second admin voids with a reason');
select throws_matching(
  $$ update public.fee_payment_records set is_voided = false where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'cannot be restored', 'void: a void cannot be undone');
select throws_matching(
  $$ update public.fee_payment_records set void_reason = 'changed story' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' $$,
  'reason cannot be changed', 'void: the void reason cannot be rewritten');

set local "request.jwt.claims" = '{"sub":"fe22fe22-fe22-4e22-8e22-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-7300000000a2','fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',500,'2026-09-07','CHEQUE','fe22fe22-fe22-4e22-8e22-2000000000a1') $$,
  'record: A1 records a second payment (balance freed by the void)');
set local "request.jwt.claims" = '{"sub":"fe22fe22-fe22-4e22-8e22-0000000000a2","role":"authenticated"}';
update public.fee_payment_records set is_voided = true, void_reason = 'bounced cheque' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a2';
select throws_matching(
  $$ update public.fee_payment_records set verified_by = 'fe22fe22-fe22-4e22-8e22-2000000000a2' where id = 'fe22fe22-fe22-4e22-8e22-7300000000a2' $$,
  'voided payment cannot be verified', 'verify: a voided payment cannot be verified');

-- ------------------------- other school / non-admin: no bypass, no leak -------------------------
set local "request.jwt.claims" = '{"sub":"fe22fe22-fe22-4e22-8e22-0000000000b1","role":"authenticated"}';
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',999999,'2026-09-05','CASH','fe22fe22-fe22-4e22-8e22-2000000000b1') $$,
  'does not exist|row-level security|cross-tenant', 'tenant: admin B cannot record for school A (rejected without revealing the balance)');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-1000000000b1','fe22fe22-fe22-4e22-8e22-7200000000a1',999999,'2026-09-05','CASH','fe22fe22-fe22-4e22-8e22-2000000000b1') $$,
  'does not exist|row-level security|cross-tenant', 'tenant: admin B cannot attach a payment to a school A assignment (no balance revealed)');
set local "request.jwt.claims" = '{"sub":"fe22fe22-fe22-4e22-8e22-0000000000a4","role":"authenticated"}';
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('fe22fe22-fe22-4e22-8e22-1000000000a1','fe22fe22-fe22-4e22-8e22-7200000000a1',10,'2026-09-05','CASH','fe22fe22-fe22-4e22-8e22-2000000000a4') $$,
  'does not exist|row-level security', 'role: a teacher cannot record payments');

-- ------------------------- audit trail (connecting role) -------------------------
reset role;
set local "request.jwt.claims" = '';
select is(public.fee_request_caller(), 'database', 'caller: a direct connection is the trusted database path');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' and action = 'fee_payment.db_recorded'
     and actor_id = 'fe22fe22-fe22-4e22-8e22-2000000000a1' and metadata ->> 'via' = 'api_user'),
  1, 'audit: recording is logged with the maker as actor');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' and action = 'fee_payment.db_receipt_changed'
     and actor_id = 'fe22fe22-fe22-4e22-8e22-2000000000a1'),
  1, 'audit: attaching a receipt is logged');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' and action = 'fee_payment.db_verified'
     and actor_id = 'fe22fe22-fe22-4e22-8e22-2000000000a2'),
  1, 'audit: verification is logged with the checker as actor');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a1' and action = 'fee_payment.db_voided'
     and actor_id = 'fe22fe22-fe22-4e22-8e22-2000000000a2'),
  1, 'audit: voiding is logged');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a1'),
  4, 'audit: rejected attempts left no partial changes and no audit rows (exactly 4 entries)');
select is(
  (select amount from public.fee_payment_records where id = 'fe22fe22-fe22-4e22-8e22-7300000000a1'),
  2000::numeric(12,2), 'tamper: the stored amount is unchanged');

-- Trusted paths remain possible and are audited.
update public.fee_payment_records set amount = 400 where id = 'fe22fe22-fe22-4e22-8e22-7300000000a2';
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a2' and action = 'fee_payment.db_updated'
     and metadata ->> 'via' = 'database' and (metadata ->> 'old_amount')::numeric = 500 and actor_id is null),
  1, 'trusted: a direct database correction is audited with the old amount');

set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select is(public.fee_request_caller(), 'service_role', 'caller: the service-role key is the trusted service path');
select lives_ok(
  $$ delete from public.fee_payment_records where id = 'fe22fe22-fe22-4e22-8e22-7300000000a2' $$,
  'trusted: the service role can still remove a record (maintenance)');
reset role;
set local "request.jwt.claims" = '';
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fe22fe22-fe22-4e22-8e22-7300000000a2' and action = 'fee_payment.db_deleted'
     and metadata ->> 'via' = 'service_role'),
  1, 'trusted: a service-role delete is audited');

select * from finish();
rollback;
