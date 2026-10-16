-- SIMPLEIN SCHOOL ERP · Fee assignment integrity (migration 0024) pgTAP suite.
-- Proves that an admin using the Supabase API with their own session cannot
-- move a paid assignment (and with it, its payments) to another student or
-- fee structure, that unpaid assignments keep their admin workflows, that
-- other schools / non-admins have no effect, that creation times are set by
-- the server, and that every assignment change is audited once. Trusted paths
-- stay possible and are audited. One transaction; rolls back at the end.
-- (Concurrency is exercised with real overlapping sessions in
-- tests/integration/fee-integrity.test.ts; one pgTAP transaction cannot.)

create extension if not exists pgtap;
begin;
select plan(30);

-- ------------------------- fixture (connecting role) -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','fa24fa24-fa24-4a24-8a24-0000000000a1','authenticated','authenticated','fa.adminA1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','fa24fa24-fa24-4a24-8a24-0000000000a2','authenticated','authenticated','fa.adminA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','fa24fa24-fa24-4a24-8a24-0000000000a4','authenticated','authenticated','fa.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','fa24fa24-fa24-4a24-8a24-0000000000b1','authenticated','authenticated','fa.adminB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('fa24fa24-fa24-4a24-8a24-1000000000a1','FeeAssign School A','feeassign-school-a'),
  ('fa24fa24-fa24-4a24-8a24-1000000000b1','FeeAssign School B','feeassign-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('fa24fa24-fa24-4a24-8a24-1100000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','2026-27','2026-04-01','2027-03-31', true),
  ('fa24fa24-fa24-4a24-8a24-1100000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('fa24fa24-fa24-4a24-8a24-2000000000a1','fa24fa24-fa24-4a24-8a24-0000000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','fa.adminA1@phase.tests','Admin A1'),
  ('fa24fa24-fa24-4a24-8a24-2000000000a2','fa24fa24-fa24-4a24-8a24-0000000000a2','fa24fa24-fa24-4a24-8a24-1000000000a1','fa.adminA2@phase.tests','Admin A2'),
  ('fa24fa24-fa24-4a24-8a24-2000000000a4','fa24fa24-fa24-4a24-8a24-0000000000a4','fa24fa24-fa24-4a24-8a24-1000000000a1','fa.teacherA@phase.tests','Teacher A'),
  ('fa24fa24-fa24-4a24-8a24-2000000000b1','fa24fa24-fa24-4a24-8a24-0000000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','fa.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('fa24fa24-fa24-4a24-8a24-2000000000a1','SCHOOL_ADMIN'),
  ('fa24fa24-fa24-4a24-8a24-2000000000a2','SCHOOL_ADMIN'),
  ('fa24fa24-fa24-4a24-8a24-2000000000a4','TEACHER'),
  ('fa24fa24-fa24-4a24-8a24-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('fa24fa24-fa24-4a24-8a24-3000000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','Grade 7',7),
  ('fa24fa24-fa24-4a24-8a24-3000000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','Grade 1',1)
on conflict (id) do nothing;

insert into public.sections (id, school_id, class_id, name) values
  ('fa24fa24-fa24-4a24-8a24-5000000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-3000000000a1','A'),
  ('fa24fa24-fa24-4a24-8a24-5000000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','fa24fa24-fa24-4a24-8a24-3000000000b1','A')
on conflict (id) do nothing;

-- Students: s1 (paid), s2 and s3 (school A), sb (school B).
insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('fa24fa24-fa24-4a24-8a24-6000000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','FA-1','Asha','FA','Asha FA','fa24fa24-fa24-4a24-8a24-3000000000a1','fa24fa24-fa24-4a24-8a24-5000000000a1','active'),
  ('fa24fa24-fa24-4a24-8a24-6000000000a2','fa24fa24-fa24-4a24-8a24-1000000000a1','FA-2','Ravi','FA','Ravi FA','fa24fa24-fa24-4a24-8a24-3000000000a1','fa24fa24-fa24-4a24-8a24-5000000000a1','active'),
  ('fa24fa24-fa24-4a24-8a24-6000000000a3','fa24fa24-fa24-4a24-8a24-1000000000a1','FA-3','Meera','FA','Meera FA','fa24fa24-fa24-4a24-8a24-3000000000a1','fa24fa24-fa24-4a24-8a24-5000000000a1','active'),
  ('fa24fa24-fa24-4a24-8a24-6000000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','FA-B1','Bina','FA','Bina FA','fa24fa24-fa24-4a24-8a24-3000000000b1','fa24fa24-fa24-4a24-8a24-5000000000b1','active')
on conflict (id) do nothing;

-- Structures: t1, t2 (school A), tb (school B).
insert into public.fee_structures (id, school_id, academic_year_id, class_id, name, due_date) values
  ('fa24fa24-fa24-4a24-8a24-7000000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-1100000000a1','fa24fa24-fa24-4a24-8a24-3000000000a1','Tuition','2026-09-30'),
  ('fa24fa24-fa24-4a24-8a24-7000000000a2','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-1100000000a1','fa24fa24-fa24-4a24-8a24-3000000000a1','Transport','2026-09-30'),
  ('fa24fa24-fa24-4a24-8a24-7000000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','fa24fa24-fa24-4a24-8a24-1100000000b1','fa24fa24-fa24-4a24-8a24-3000000000b1','Tuition','2026-09-30')
on conflict (id) do nothing;

-- Assignments: paid (s1,t1), unpaid (s2,t1), voided-only (s1,t2), school B (sb,tb).
insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount) values
  ('fa24fa24-fa24-4a24-8a24-7200000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-6000000000a1','fa24fa24-fa24-4a24-8a24-7000000000a1',5000),
  ('fa24fa24-fa24-4a24-8a24-7200000000a2','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-6000000000a2','fa24fa24-fa24-4a24-8a24-7000000000a1',5000),
  ('fa24fa24-fa24-4a24-8a24-7200000000a3','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-6000000000a1','fa24fa24-fa24-4a24-8a24-7000000000a2',3000),
  ('fa24fa24-fa24-4a24-8a24-7200000000b1','fa24fa24-fa24-4a24-8a24-1000000000b1','fa24fa24-fa24-4a24-8a24-6000000000b1','fa24fa24-fa24-4a24-8a24-7000000000b1',4000)
on conflict (id) do nothing;

-- A verified payment on the paid assignment; only a voided one on (s1,t2).
insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, recorded_by, verified_by, is_voided, void_reason) values
  ('fa24fa24-fa24-4a24-8a24-7300000000a1','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-7200000000a1',2000,'2026-09-05','CASH','fa24fa24-fa24-4a24-8a24-2000000000a1','fa24fa24-fa24-4a24-8a24-2000000000a2',false,null),
  ('fa24fa24-fa24-4a24-8a24-7300000000a3','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-7200000000a3',500,'2026-09-05','CASH','fa24fa24-fa24-4a24-8a24-2000000000a1',null,true,'entered twice')
on conflict (id) do nothing;

-- ------------------------- A1 (school admin) via the API role -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"fa24fa24-fa24-4a24-8a24-0000000000a1","role":"authenticated"}';

select throws_matching(
  $$ update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'has payment records', 'reassign: a paid assignment cannot be moved to another student');
select throws_matching(
  $$ update public.student_fees set fee_structure_id = 'fa24fa24-fa24-4a24-8a24-7000000000a2' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'has payment records', 'reassign: a paid assignment cannot be moved to another fee structure');
select throws_matching(
  $$ update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3', fee_structure_id = 'fa24fa24-fa24-4a24-8a24-7000000000a2' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'has payment records', 'reassign: student and structure together are refused too');
select throws_matching(
  $$ update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a3' $$,
  'has payment records', 'reassign: an assignment whose only payment is voided keeps its history (refused)');
select throws_matching(
  $$ update public.student_fees set school_id = 'fa24fa24-fa24-4a24-8a24-1000000000b1' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'has payment records|immutable|row-level security', 'reassign: a paid assignment cannot be moved to another school');
select is(
  (select student_id::text || '/' || fee_structure_id::text from public.student_fees where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1'),
  'fa24fa24-fa24-4a24-8a24-6000000000a1/fa24fa24-fa24-4a24-8a24-7000000000a1',
  'reassign: the paid assignment still belongs to the original student and structure');

-- Legitimate administration of the paid assignment still works.
select lives_ok(
  $$ update public.student_fees set due_date = '2026-12-31' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'admin: the due date of a paid assignment can change');
select lives_ok(
  $$ update public.student_fees set total_amount = 5500 where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'admin: the total of a paid assignment can be raised');
-- Re-assigning a structure (assignFees upsert) rewrites the same student and structure: allowed.
select lives_ok(
  $$ insert into public.student_fees (school_id, student_id, fee_structure_id, total_amount, due_date)
     values ('fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-6000000000a1','fa24fa24-fa24-4a24-8a24-7000000000a1',5500,'2026-12-31')
     on conflict (student_id, fee_structure_id) do update set
       school_id = excluded.school_id, student_id = excluded.student_id, fee_structure_id = excluded.fee_structure_id,
       total_amount = excluded.total_amount, due_date = excluded.due_date $$,
  'admin: an idempotent re-assign upsert on a paid assignment is allowed');
select throws_matching(
  $$ update public.student_fees set created_at = '2020-01-01' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'creation time', 'tamper: the creation time of an assignment cannot be changed');

-- Unpaid assignments: existing admin workflows are preserved.
select lives_ok(
  $$ update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' $$,
  'unpaid: an assignment without payments can be moved to another student');
select lives_ok(
  $$ update public.student_fees set fee_structure_id = 'fa24fa24-fa24-4a24-8a24-7000000000a2' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' $$,
  'unpaid: an assignment without payments can be moved to another structure');
select throws_matching(
  $$ update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000b1' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' $$,
  'does not exist|cross-tenant reference', 'tenant: an assignment cannot point at another school''s student (no existence leak)');
select throws_matching(
  $$ update public.student_fees set fee_structure_id = 'fa24fa24-fa24-4a24-8a24-7000000000b1' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' $$,
  'does not exist|cross-tenant reference', 'tenant: an assignment cannot point at another school''s structure (no existence leak)');
select lives_ok(
  $$ insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount, created_at)
     values ('fa24fa24-fa24-4a24-8a24-7200000000a4','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-6000000000a2','fa24fa24-fa24-4a24-8a24-7000000000a1',5000,'2020-01-01') $$,
  'unpaid: a new assignment can be created');
select ok(
  (select created_at > now() - interval '1 hour' from public.student_fees where id = 'fa24fa24-fa24-4a24-8a24-7200000000a4'),
  'tamper: a new assignment gets the server''s creation time, not the supplied one');
select lives_ok(
  $$ insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, recorded_by, created_at, version)
     values ('fa24fa24-fa24-4a24-8a24-7300000000a4','fa24fa24-fa24-4a24-8a24-1000000000a1','fa24fa24-fa24-4a24-8a24-7200000000a4',100,'2026-09-06','CASH','fa24fa24-fa24-4a24-8a24-2000000000a1','2020-01-01',7) $$,
  'record: A1 records a payment with a supplied creation time and version');
select is(
  (select (created_at > now() - interval '1 hour')::text || '/' || version::text from public.fee_payment_records where id = 'fa24fa24-fa24-4a24-8a24-7300000000a4'),
  'true/1', 'tamper: a payment gets the server''s creation time and version 1 (no back-dating)');
select throws_matching(
  $$ update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a4' $$,
  'has payment records', 'reassign: once paid, the new assignment is frozen too');

-- Deleting: unpaid allowed; paid refused (0022 cascade protection).
select lives_ok(
  $$ delete from public.student_fees where id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' $$,
  'unpaid: an assignment without payments can be deleted');
select throws_matching(
  $$ delete from public.student_fees where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' $$,
  'cannot be deleted', 'delete: a paid assignment cannot be deleted');

-- ------------------------- other school / non-admin: no effect -------------------------
set local "request.jwt.claims" = '{"sub":"fa24fa24-fa24-4a24-8a24-0000000000b1","role":"authenticated"}';
update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000b1' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1';
set local "request.jwt.claims" = '{"sub":"fa24fa24-fa24-4a24-8a24-0000000000a4","role":"authenticated"}';
update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1';
reset role;
set local "request.jwt.claims" = '';
select is(
  (select student_id::text from public.student_fees where id = 'fa24fa24-fa24-4a24-8a24-7200000000a1'),
  'fa24fa24-fa24-4a24-8a24-6000000000a1', 'tenant/role: another school''s admin and a teacher had no effect');

-- ------------------------- audit trail (connecting role) -------------------------
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' and action = 'fee_assignment.db_reassigned'),
  0, 'audit: refused re-assignments left no audit rows');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' and action = 'fee_assignment.db_updated'
     and actor_id = 'fa24fa24-fa24-4a24-8a24-2000000000a1' and metadata ->> 'via' = 'api_user'),
  2, 'audit: the due-date and total changes are logged once each; the idempotent upsert is not');
select is(
  (select metadata -> 'changed' from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a1' and action = 'fee_assignment.db_updated'
     and (metadata ->> 'old_total_amount')::numeric = 5000),
  '["total_amount"]'::jsonb, 'audit: a total change records the old total');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' and action = 'fee_assignment.db_reassigned'
     and actor_id = 'fa24fa24-fa24-4a24-8a24-2000000000a1'
     and metadata ->> 'old_student_id' = 'fa24fa24-fa24-4a24-8a24-6000000000a2'),
  1, 'audit: moving an unpaid assignment is logged as a re-assignment with the old student');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a2' and action = 'fee_assignment.db_deleted'
     and metadata ->> 'via' = 'api_user'),
  1, 'audit: deleting an unpaid assignment is logged');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a4' and action = 'fee_assignment.db_created'
     and actor_id = 'fa24fa24-fa24-4a24-8a24-2000000000a1'),
  1, 'audit: creating an assignment is logged with the admin as actor');

-- Trusted paths are exempt from the rule but audited.
update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a3' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a3';
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a3' and action = 'fee_assignment.db_reassigned'
     and metadata ->> 'via' = 'database' and actor_id is null),
  1, 'trusted: a direct database re-assignment is possible and audited');
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
update public.student_fees set student_id = 'fa24fa24-fa24-4a24-8a24-6000000000a1' where id = 'fa24fa24-fa24-4a24-8a24-7200000000a3';
reset role;
set local "request.jwt.claims" = '';
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'fa24fa24-fa24-4a24-8a24-7200000000a3' and action = 'fee_assignment.db_reassigned'
     and metadata ->> 'via' = 'service_role'),
  1, 'trusted: a service-role re-assignment is possible and audited');

select * from finish();
rollback;
