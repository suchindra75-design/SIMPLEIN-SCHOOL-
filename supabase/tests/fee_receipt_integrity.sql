-- SIMPLEIN SCHOOL ERP · Fee receipt evidence integrity (migration 0026) pgTAP suite.
-- Database side: receipt columns are frozen once a payment is verified or
-- voided and must point at the payment's own folder. Storage side (the
-- storage.objects rows the Storage API writes with the caller's session):
-- admins upload only into an unverified payment's folder, can never
-- overwrite or move an object, and can delete only files no payment refers
-- to. Deletes are issued with storage.allow_delete_query = true, as the
-- Storage API does, so the row-level policies are what decides. Trusted
-- paths stay possible and are audited. One transaction; rolls back.

create extension if not exists pgtap;
begin;
select plan(29);

-- ------------------------- fixture (connecting role) -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','ec26ec26-ec26-4e26-8e26-0000000000a1','authenticated','authenticated','ri.adminA1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','ec26ec26-ec26-4e26-8e26-0000000000a2','authenticated','authenticated','ri.adminA2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','ec26ec26-ec26-4e26-8e26-0000000000a4','authenticated','authenticated','ri.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','ec26ec26-ec26-4e26-8e26-0000000000b1','authenticated','authenticated','ri.adminB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('ec26ec26-ec26-4e26-8e26-1000000000a1','ReceiptInt School A','receiptint-school-a'),
  ('ec26ec26-ec26-4e26-8e26-1000000000b1','ReceiptInt School B','receiptint-school-b')
on conflict (id) do nothing;
insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('ec26ec26-ec26-4e26-8e26-1100000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;
insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('ec26ec26-ec26-4e26-8e26-2000000000a1','ec26ec26-ec26-4e26-8e26-0000000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','ri.adminA1@phase.tests','Admin A1'),
  ('ec26ec26-ec26-4e26-8e26-2000000000a2','ec26ec26-ec26-4e26-8e26-0000000000a2','ec26ec26-ec26-4e26-8e26-1000000000a1','ri.adminA2@phase.tests','Admin A2'),
  ('ec26ec26-ec26-4e26-8e26-2000000000a4','ec26ec26-ec26-4e26-8e26-0000000000a4','ec26ec26-ec26-4e26-8e26-1000000000a1','ri.teacherA@phase.tests','Teacher A'),
  ('ec26ec26-ec26-4e26-8e26-2000000000b1','ec26ec26-ec26-4e26-8e26-0000000000b1','ec26ec26-ec26-4e26-8e26-1000000000b1','ri.adminB@phase.tests','Admin B')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ec26ec26-ec26-4e26-8e26-2000000000a1','SCHOOL_ADMIN'),
  ('ec26ec26-ec26-4e26-8e26-2000000000a2','SCHOOL_ADMIN'),
  ('ec26ec26-ec26-4e26-8e26-2000000000a4','TEACHER'),
  ('ec26ec26-ec26-4e26-8e26-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;
insert into public.classes (id, school_id, name, order_index) values
  ('ec26ec26-ec26-4e26-8e26-3000000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','Grade 7',7)
on conflict (id) do nothing;
insert into public.sections (id, school_id, class_id, name) values
  ('ec26ec26-ec26-4e26-8e26-5000000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-3000000000a1','A')
on conflict (id) do nothing;
insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('ec26ec26-ec26-4e26-8e26-6000000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','RI-1','Asha','RI','Asha RI','ec26ec26-ec26-4e26-8e26-3000000000a1','ec26ec26-ec26-4e26-8e26-5000000000a1','active')
on conflict (id) do nothing;
insert into public.fee_structures (id, school_id, academic_year_id, class_id, name) values
  ('ec26ec26-ec26-4e26-8e26-7000000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-1100000000a1','ec26ec26-ec26-4e26-8e26-3000000000a1','Tuition')
on conflict (id) do nothing;
insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount) values
  ('ec26ec26-ec26-4e26-8e26-7200000000a1','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-6000000000a1','ec26ec26-ec26-4e26-8e26-7000000000a1',9000)
on conflict (id) do nothing;

-- Payments: pU unverified, pV verified (with a receipt), pX voided, pW unverified.
insert into public.fee_payment_records (id, school_id, student_fee_id, amount, paid_on, mode, recorded_by, verified_by, is_voided, void_reason, receipt_bucket, receipt_path, receipt_name, receipt_mime, receipt_bytes) values
  ('ec26ec26-ec26-4e26-8e26-73000000000a','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-7200000000a1',1000,'2026-09-05','CASH','ec26ec26-ec26-4e26-8e26-2000000000a1',null,false,null,null,null,null,null,null),
  ('ec26ec26-ec26-4e26-8e26-73000000000b','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-7200000000a1',2000,'2026-09-05','CASH','ec26ec26-ec26-4e26-8e26-2000000000a1','ec26ec26-ec26-4e26-8e26-2000000000a2',false,null,
   'fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf','v.pdf','application/pdf',100),
  ('ec26ec26-ec26-4e26-8e26-73000000000c','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-7200000000a1',500,'2026-09-05','CASH','ec26ec26-ec26-4e26-8e26-2000000000a1',null,true,'duplicate',null,null,null,null,null),
  ('ec26ec26-ec26-4e26-8e26-73000000000d','ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-7200000000a1',700,'2026-09-05','CASH','ec26ec26-ec26-4e26-8e26-2000000000a1',null,false,null,null,null,null,null,null)
on conflict (id) do nothing;

-- Stored objects: the verified receipt, the unverified payment's current
-- receipt (set below), and an orphan replaced before verification.
insert into storage.objects (bucket_id, name, metadata) values
  ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf','{"size":100}'),
  ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/u.pdf','{"size":100}'),
  ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf','{"size":100}');

-- Test-only helper (rolled back with the transaction): counts an object
-- whatever the caller may see, so deletes attempted by any role can be checked.
create function public.fee_receipt_object_count_for_test(object_name text) returns int
language sql security definer set search_path = public
as $$ select count(*)::int from storage.objects where bucket_id = 'fee-receipts' and name = object_name $$;
grant execute on function public.fee_receipt_object_count_for_test(text) to authenticated;

-- ------------------------- A1 (recorder) via the API role: receipt columns -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"ec26ec26-ec26-4e26-8e26-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$ update public.fee_payment_records set receipt_bucket = 'fee-receipts',
       receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/u.pdf',
       receipt_name = 'u.pdf', receipt_mime = 'application/pdf', receipt_bytes = 100
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000a' $$,
  'receipt: attached to an unverified payment, in its own folder');
select throws_matching(
  $$ update public.fee_payment_records set receipt_bucket = 'fee-receipts',
       receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000d' $$,
  'uploaded for this payment', 'receipt: cannot point at another payment''s receipt');
select throws_matching(
  $$ update public.fee_payment_records set receipt_bucket = 'fee-receipts',
       receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000b1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000d/x.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000d' $$,
  'uploaded for this payment', 'receipt: cannot point into another school''s folder');
select throws_matching(
  $$ update public.fee_payment_records set receipt_bucket = 'homework-attachments',
       receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000d/x.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000d' $$,
  'uploaded for this payment', 'receipt: must be in the fee-receipts bucket');
select throws_matching(
  $$ update public.fee_payment_records set receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/swap.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000b' $$,
  'verified or voided payment cannot be changed', 'freeze: the receipt of a verified payment cannot be replaced');
select throws_matching(
  $$ update public.fee_payment_records set receipt_bucket = null, receipt_path = null, receipt_name = null, receipt_mime = null, receipt_bytes = null
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000b' $$,
  'verified or voided payment cannot be changed', 'freeze: the receipt of a verified payment cannot be removed');
select throws_matching(
  $$ update public.fee_payment_records set receipt_name = 'other.pdf' where id = 'ec26ec26-ec26-4e26-8e26-73000000000b' $$,
  'verified or voided payment cannot be changed', 'freeze: the receipt details of a verified payment cannot change');
select throws_matching(
  $$ update public.fee_payment_records set receipt_bucket = 'fee-receipts',
       receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000c/x.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000c' $$,
  'verified or voided payment cannot be changed', 'freeze: a voided payment''s receipt cannot change');
select throws_matching(
  $$ insert into public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by, receipt_bucket, receipt_path)
     values ('ec26ec26-ec26-4e26-8e26-1000000000a1','ec26ec26-ec26-4e26-8e26-7200000000a1',10,'2026-09-06','CASH','ec26ec26-ec26-4e26-8e26-2000000000a1',
             'fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf') $$,
  'uploaded for this payment', 'receipt: a new payment cannot reuse another payment''s receipt');

-- ------------------------- A1 via the API role: Storage objects -------------------------
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/new.pdf') $$,
  'row-level security', 'storage: no upload into a verified payment''s folder');
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000c/new.pdf') $$,
  'row-level security', 'storage: no upload into a voided payment''s folder');
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/limit-test/new.pdf') $$,
  'row-level security', 'storage: no upload outside a payment folder');
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000d/a/b.pdf') $$,
  'row-level security', 'storage: no upload into nested folders');
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000b1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000d/new.pdf') $$,
  'row-level security', 'storage: no upload into another school''s folder');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000d/new.pdf') $$,
  'storage: an admin uploads into an unverified payment''s folder');

update storage.objects set metadata = '{"size":1}'
  where name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf';
update storage.objects set name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/moved.pdf'
  where name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf';
update storage.objects set metadata = '{"size":1}'
  where name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/u.pdf';
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'fee-receipts' and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf';
select is(public.fee_receipt_object_count_for_test('schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf'), 1, 'storage: the verified receipt file cannot be deleted');
delete from storage.objects where bucket_id = 'fee-receipts' and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/u.pdf';
select is(public.fee_receipt_object_count_for_test('schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/u.pdf'), 1, 'storage: a file a payment refers to cannot be deleted');

set local "request.jwt.claims" = '{"sub":"ec26ec26-ec26-4e26-8e26-0000000000b1","role":"authenticated"}';
delete from storage.objects where bucket_id = 'fee-receipts' and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf';
select is(public.fee_receipt_object_count_for_test('schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf'), 1, 'tenant: another school''s admin cannot delete the orphan');
set local "request.jwt.claims" = '{"sub":"ec26ec26-ec26-4e26-8e26-0000000000a4","role":"authenticated"}';
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000d/t.pdf') $$,
  'row-level security', 'role: a teacher cannot upload receipts');
delete from storage.objects where bucket_id = 'fee-receipts' and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf';
select is(public.fee_receipt_object_count_for_test('schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf'), 1, 'role: a teacher cannot delete receipts');

set local "request.jwt.claims" = '{"sub":"ec26ec26-ec26-4e26-8e26-0000000000a1","role":"authenticated"}';
delete from storage.objects where bucket_id = 'fee-receipts' and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf';
select is(public.fee_receipt_object_count_for_test('schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf'), 0, 'storage: an admin can delete a file no payment refers to (replaced before verification)');

-- ------------------------- A2 (checker) -------------------------
set local "request.jwt.claims" = '{"sub":"ec26ec26-ec26-4e26-8e26-0000000000a2","role":"authenticated"}';
select throws_matching(
  $$ update public.fee_payment_records set verified_by = 'ec26ec26-ec26-4e26-8e26-2000000000a2',
       receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/old.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000a' $$,
  'not in the same change', 'freeze: the checker cannot swap the receipt while verifying');
select lives_ok(
  $$ update public.fee_payment_records set verified_by = 'ec26ec26-ec26-4e26-8e26-2000000000a2' where id = 'ec26ec26-ec26-4e26-8e26-73000000000a' $$,
  'verify: the checker verifies the payment with its receipt');
set local "request.jwt.claims" = '{"sub":"ec26ec26-ec26-4e26-8e26-0000000000a1","role":"authenticated"}';
select throws_matching(
  $$ update public.fee_payment_records set receipt_path = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/later.pdf'
     where id = 'ec26ec26-ec26-4e26-8e26-73000000000a' $$,
  'verified or voided payment cannot be changed', 'freeze: once verified, the recorder cannot replace the receipt');
select throws_matching(
  $$ insert into storage.objects (bucket_id, name) values ('fee-receipts','schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/later.pdf') $$,
  'row-level security', 'storage: once verified, no new file can be added to the payment''s folder');

-- ------------------------- checks (connecting role) -------------------------
reset role;
set local "request.jwt.claims" = '';
select is(
  (select count(*)::int from storage.objects where bucket_id = 'fee-receipts'
     and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf'
     and metadata ->> 'size' = '100'),
  1, 'storage: the verified receipt object was neither overwritten, moved nor deleted');
select is(
  (select metadata ->> 'size' from storage.objects where bucket_id = 'fee-receipts'
     and name = 'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000a/u.pdf'),
  '100', 'storage: objects cannot be overwritten through user sessions (no update policy)');
select is(
  (select receipt_path from public.fee_payment_records where id = 'ec26ec26-ec26-4e26-8e26-73000000000b'),
  'schools/ec26ec26-ec26-4e26-8e26-1000000000a1/fee-receipts/ec26ec26-ec26-4e26-8e26-73000000000b/v.pdf',
  'freeze: the verified payment still refers to the approved receipt');
update public.fee_payment_records set receipt_name = 'corrected.pdf' where id = 'ec26ec26-ec26-4e26-8e26-73000000000b';
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'ec26ec26-ec26-4e26-8e26-73000000000b'
     and action = 'fee_payment.db_receipt_changed' and metadata ->> 'via' = 'database'),
  1, 'trusted: a direct database receipt correction is possible and audited');

select * from finish();
rollback;
