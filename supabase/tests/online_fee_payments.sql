-- SIMPLEIN SCHOOL ERP · Online fee payments (migration 0028) pgTAP suite.
-- Payers (parent of a linked child, or the student) can only start CREATED
-- orders in their own name within the outstanding balance; nobody with a user
-- session can create gateway records, verify them, call settlement, or move
-- an order. Settlement (service role) is idempotent and never overpays: it
-- parks the order in REVIEW instead. One transaction; rolls back at the end.

create extension if not exists pgtap;
begin;
select plan(31);

-- ------------------------- fixture (connecting role) -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','0e280e28-0e28-4e28-8e28-0000000000a1','authenticated','authenticated','op.admin1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0e280e28-0e28-4e28-8e28-0000000000a2','authenticated','authenticated','op.admin2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0e280e28-0e28-4e28-8e28-0000000000a3','authenticated','authenticated','op.parent@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0e280e28-0e28-4e28-8e28-0000000000a5','authenticated','authenticated','op.parent2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0e280e28-0e28-4e28-8e28-0000000000a6','authenticated','authenticated','op.student@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug, online_payments_enabled) values
  ('0e280e28-0e28-4e28-8e28-1000000000a1','OnlinePay School A','onlinepay-school-a', true)
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('0e280e28-0e28-4e28-8e28-1100000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('0e280e28-0e28-4e28-8e28-2000000000a1','0e280e28-0e28-4e28-8e28-0000000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','op.admin1@phase.tests','Admin 1'),
  ('0e280e28-0e28-4e28-8e28-2000000000a2','0e280e28-0e28-4e28-8e28-0000000000a2','0e280e28-0e28-4e28-8e28-1000000000a1','op.admin2@phase.tests','Admin 2'),
  ('0e280e28-0e28-4e28-8e28-2000000000a3','0e280e28-0e28-4e28-8e28-0000000000a3','0e280e28-0e28-4e28-8e28-1000000000a1','op.parent@phase.tests','Parent'),
  ('0e280e28-0e28-4e28-8e28-2000000000a5','0e280e28-0e28-4e28-8e28-0000000000a5','0e280e28-0e28-4e28-8e28-1000000000a1','op.parent2@phase.tests','Other Parent'),
  ('0e280e28-0e28-4e28-8e28-2000000000a6','0e280e28-0e28-4e28-8e28-0000000000a6','0e280e28-0e28-4e28-8e28-1000000000a1','op.student@phase.tests','Student')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('0e280e28-0e28-4e28-8e28-2000000000a1','SCHOOL_ADMIN'),
  ('0e280e28-0e28-4e28-8e28-2000000000a2','SCHOOL_ADMIN'),
  ('0e280e28-0e28-4e28-8e28-2000000000a3','PARENT'),
  ('0e280e28-0e28-4e28-8e28-2000000000a5','PARENT'),
  ('0e280e28-0e28-4e28-8e28-2000000000a6','STUDENT')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('0e280e28-0e28-4e28-8e28-3000000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','Grade 9',9)
on conflict (id) do nothing;
insert into public.sections (id, school_id, class_id, name) values
  ('0e280e28-0e28-4e28-8e28-5000000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-3000000000a1','A')
on conflict (id) do nothing;

insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status, user_id) values
  ('0e280e28-0e28-4e28-8e28-6000000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','OP-1','Asha','OP','Asha OP','0e280e28-0e28-4e28-8e28-3000000000a1','0e280e28-0e28-4e28-8e28-5000000000a1','active', null),
  ('0e280e28-0e28-4e28-8e28-6000000000a2','0e280e28-0e28-4e28-8e28-1000000000a1','OP-2','Bala','OP','Bala OP','0e280e28-0e28-4e28-8e28-3000000000a1','0e280e28-0e28-4e28-8e28-5000000000a1','active','0e280e28-0e28-4e28-8e28-2000000000a6')
on conflict (id) do nothing;

insert into public.parents (id, school_id, user_id, full_name) values
  ('0e280e28-0e28-4e28-8e28-4000000000a3','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-2000000000a3','Parent'),
  ('0e280e28-0e28-4e28-8e28-4000000000a5','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-2000000000a5','Other Parent')
on conflict (id) do nothing;
insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('0e280e28-0e28-4e28-8e28-6000000000a1','0e280e28-0e28-4e28-8e28-4000000000a3','mother', true)
on conflict do nothing;

insert into public.fee_structures (id, school_id, academic_year_id, class_id, name, due_date) values
  ('0e280e28-0e28-4e28-8e28-7000000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-1100000000a1','0e280e28-0e28-4e28-8e28-3000000000a1','Term 1','2026-12-31')
on conflict (id) do nothing;
insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount) values
  ('0e280e28-0e28-4e28-8e28-7200000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-6000000000a1','0e280e28-0e28-4e28-8e28-7000000000a1',5000),
  ('0e280e28-0e28-4e28-8e28-7200000000a2','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-6000000000a2','0e280e28-0e28-4e28-8e28-7000000000a1',5000)
on conflict (id) do nothing;

-- ------------------------- parent via the API role -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"0e280e28-0e28-4e28-8e28-0000000000a3","role":"authenticated"}';

select lives_ok(
  $$ insert into public.fee_payment_orders (id, school_id, student_fee_id, amount, gateway_order_id, initiated_by)
     values ('0e280e28-0e28-4e28-8e28-8000000000a1','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',3000,'order_T1','0e280e28-0e28-4e28-8e28-2000000000a3') $$,
  'parent starts a 3000 order for a linked child');
select throws_matching(
  $$ insert into public.fee_payment_orders (school_id, student_fee_id, amount, gateway_order_id, initiated_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',100,'order_T2','0e280e28-0e28-4e28-8e28-2000000000a5') $$,
  'own name', 'parent cannot start an order in someone else''s name');
select throws_matching(
  $$ insert into public.fee_payment_orders (school_id, student_fee_id, amount, gateway_order_id, initiated_by, status)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',100,'order_T3','0e280e28-0e28-4e28-8e28-2000000000a3','PAID') $$,
  'start unpaid', 'parent cannot create an already-paid order');
select throws_matching(
  $$ insert into public.fee_payment_orders (school_id, student_fee_id, amount, gateway_order_id, initiated_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',5001,'order_T4','0e280e28-0e28-4e28-8e28-2000000000a3') $$,
  'exceeds the outstanding balance', 'order above the outstanding balance is refused');
select throws_matching(
  $$ insert into public.fee_payment_orders (school_id, student_fee_id, amount, gateway_order_id, initiated_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a2',100,'order_T5','0e280e28-0e28-4e28-8e28-2000000000a3') $$,
  'row-level security|does not exist', 'parent cannot pay for a child who is not linked (refused without revealing the fee)');
select throws_matching(
  $$ select * from public.settle_fee_payment_order('order_T1','pay_FAKE',300000, now()) $$,
  'permission denied', 'a user session cannot call settlement');
update public.fee_payment_orders set status = 'PAID' where id = '0e280e28-0e28-4e28-8e28-8000000000a1';
select is((select count(*)::int from public.fee_payment_orders where id = '0e280e28-0e28-4e28-8e28-8000000000a1'), 1,
  'parent can read their own order');

-- ------------------------- other parent -------------------------
set local "request.jwt.claims" = '{"sub":"0e280e28-0e28-4e28-8e28-0000000000a5","role":"authenticated"}';
select is((select count(*)::int from public.fee_payment_orders where school_id = '0e280e28-0e28-4e28-8e28-1000000000a1'), 0,
  'another parent cannot see the order');

-- ------------------------- student (own fee) -------------------------
set local "request.jwt.claims" = '{"sub":"0e280e28-0e28-4e28-8e28-0000000000a6","role":"authenticated"}';
select lives_ok(
  $$ insert into public.fee_payment_orders (school_id, student_fee_id, amount, gateway_order_id, initiated_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a2',500,'order_S1','0e280e28-0e28-4e28-8e28-2000000000a6') $$,
  'student starts an order for their own fee');
select throws_matching(
  $$ insert into public.fee_payment_orders (school_id, student_fee_id, amount, gateway_order_id, initiated_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',500,'order_S2','0e280e28-0e28-4e28-8e28-2000000000a6') $$,
  'row-level security|does not exist', 'student cannot pay another student''s fee (refused without revealing the fee)');

-- ------------------------- admin via the API role -------------------------
set local "request.jwt.claims" = '{"sub":"0e280e28-0e28-4e28-8e28-0000000000a1","role":"authenticated"}';
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by, source, gateway, gateway_payment_id, gateway_order_id)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',100,'2026-11-08','ONLINE','0e280e28-0e28-4e28-8e28-2000000000a1','GATEWAY','RAZORPAY','pay_FORGED','order_T1') $$,
  'only by the payment gateway', 'an admin cannot forge a gateway payment record');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',100,'2026-11-08','ONLINE','0e280e28-0e28-4e28-8e28-2000000000a1') $$,
  'only by the payment gateway', 'an admin cannot record an office payment as ONLINE');
select is((select count(*)::int from public.fee_payment_orders where school_id = '0e280e28-0e28-4e28-8e28-1000000000a1'), 2,
  'admin sees the school''s orders');

reset role;
select is((select status from public.fee_payment_orders where id = '0e280e28-0e28-4e28-8e28-8000000000a1'), 'CREATED',
  'the parent''s UPDATE changed nothing (no update policy)');

-- More orders while 5000 is still outstanding (orders do not reserve the balance).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"0e280e28-0e28-4e28-8e28-0000000000a3","role":"authenticated"}';
insert into public.fee_payment_orders (id, school_id, student_fee_id, amount, gateway_order_id, initiated_by) values
  ('0e280e28-0e28-4e28-8e28-8000000000a2','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',2000,'order_T6','0e280e28-0e28-4e28-8e28-2000000000a3'),
  ('0e280e28-0e28-4e28-8e28-8000000000a3','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',2500,'order_T7','0e280e28-0e28-4e28-8e28-2000000000a3'),
  ('0e280e28-0e28-4e28-8e28-8000000000a4','0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a1',1000,'order_T8','0e280e28-0e28-4e28-8e28-2000000000a3');

-- ------------------------- settlement (service role) -------------------------
reset role;
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';

select is((select status from public.settle_fee_payment_order('order_T1','pay_T1',300000, now())), 'PAID',
  'settle: a captured 3000 payment is applied');
select is((select status from public.settle_fee_payment_order('order_T1','pay_T1',300000, now())), 'PAID',
  'settle: replaying the same capture is a no-op');
select is((select status from public.settle_fee_payment_order('order_T1','pay_T1B',300000, now())), 'REVIEW',
  'settle: a second, different capture on a paid order needs review');
select is((select status from public.settle_fee_payment_order('order_T8','pay_T8',99900, now())), 'REVIEW',
  'settle: a captured amount different from the order goes to review');
select is((select status from public.settle_fee_payment_order('order_T6','pay_T6',200000, now())), 'PAID',
  'settle: a 2000 payment fills the balance');
select is((select status from public.settle_fee_payment_order('order_T7','pay_T7',250000, now())), 'REVIEW',
  'settle: a payment that would overpay goes to review, not to the fee');
select is((select status from public.settle_fee_payment_order('order_NOPE','pay_X',100, now())), 'UNKNOWN_ORDER',
  'settle: unknown orders are reported, nothing is written');

reset role;
select is((select count(*)::int from public.fee_payment_records
           where student_fee_id = '0e280e28-0e28-4e28-8e28-7200000000a1' and source = 'GATEWAY'), 2,
  'exactly two gateway records exist (no duplicates, nothing from review orders)');
select is((select sum(amount)::numeric from public.fee_payment_records
           where student_fee_id = '0e280e28-0e28-4e28-8e28-7200000000a1' and not is_voided), 5000::numeric,
  'the fee is paid exactly in full, never over');
select ok((select bool_and(mode = 'ONLINE' and verified_by is null and recorded_by = '0e280e28-0e28-4e28-8e28-2000000000a3')
           from public.fee_payment_records where student_fee_id = '0e280e28-0e28-4e28-8e28-7200000000a1'),
  'gateway records: mode ONLINE, recorded in the payer''s name, no staff verifier');
select is((select payment_record_id is not null and status = 'PAID' from public.fee_payment_orders where gateway_order_id = 'order_T1'), true,
  'the paid order links to its payment record');
select ok(exists (select 1 from public.audit_logs where entity = 'fee_payment_orders' and action = 'fee_payment_order.db_review'
                  and entity_id = '0e280e28-0e28-4e28-8e28-8000000000a3'),
  'audit: the review is recorded');
select ok(exists (select 1 from public.audit_logs where action = 'fee_payment_order.db_duplicate_capture'),
  'audit: the duplicate capture is recorded');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
     values ('0e280e28-0e28-4e28-8e28-1000000000a1','0e280e28-0e28-4e28-8e28-7200000000a2',100,'2026-11-08','ONLINE','0e280e28-0e28-4e28-8e28-2000000000a1') $$,
  'fee_payment_records_source_check', 'even trusted paths cannot write an ONLINE record without gateway references');

-- ------------------------- admins and gateway records -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"0e280e28-0e28-4e28-8e28-0000000000a2","role":"authenticated"}';
select throws_matching(
  $$ update public.fee_payment_records set verified_by = '0e280e28-0e28-4e28-8e28-2000000000a2'
     where gateway_payment_id = 'pay_T1' $$,
  'need no verification', 'an admin cannot verify a gateway record');
select lives_ok(
  $$ update public.fee_payment_records set is_voided = true, void_reason = 'Refunded from the Razorpay dashboard'
     where gateway_payment_id = 'pay_T6' $$,
  'an admin can void a gateway record after a refund (reason required)');

-- ------------------------- grants -------------------------
reset role;
select ok(
  not has_function_privilege('authenticated', 'public.settle_fee_payment_order(text, text, bigint, timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.settle_fee_payment_order(text, text, bigint, timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.note_fee_payment_order_failure(text, text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.settle_fee_payment_order(text, text, bigint, timestamptz)', 'EXECUTE'),
  'settlement functions: service role only');

select * from finish();
rollback;
