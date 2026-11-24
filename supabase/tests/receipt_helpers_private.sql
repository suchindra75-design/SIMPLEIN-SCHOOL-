-- SIMPLEIN SCHOOL ERP · Receipt policy helpers are not API endpoints (migration 0027).
-- The helpers live in schema `private` (not served by PostgREST), only
-- `authenticated` may use them (the storage policies run as the caller), and
-- the fee-receipts policies call the private versions. The policies' behaviour
-- is covered by fee_receipt_integrity.sql. One transaction; rolls back.

create extension if not exists pgtap;
begin;
select plan(9);

select is(to_regprocedure('public.fee_receipt_upload_allowed(text)'), null,
  'public.fee_receipt_upload_allowed no longer exists (no /rpc endpoint)');
select is(to_regprocedure('public.fee_receipt_is_referenced(text)'), null,
  'public.fee_receipt_is_referenced no longer exists (no /rpc endpoint)');
select isnt(to_regprocedure('private.fee_receipt_upload_allowed(text)'), null,
  'private.fee_receipt_upload_allowed exists');
select isnt(to_regprocedure('private.fee_receipt_is_referenced(text)'), null,
  'private.fee_receipt_is_referenced exists');
select ok(
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fee_receipt_%'),
  'no fee_receipt_* function is left in the public (API) schema');
select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE')
  and has_function_privilege('authenticated', 'private.fee_receipt_upload_allowed(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.fee_receipt_is_referenced(text)', 'EXECUTE'),
  'authenticated can use the helpers (storage policies run as the caller)');
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_function_privilege('anon', 'private.fee_receipt_upload_allowed(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.fee_receipt_is_referenced(text)', 'EXECUTE'),
  'anon cannot use the private schema or the helpers');
select ok(
  (select with_check from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'fee_receipts_admin_insert') like '%private.fee_receipt_upload_allowed%',
  'the fee-receipts insert policy calls the private helper');
select ok(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'fee_receipts_admin_delete') like '%private.fee_receipt_is_referenced%',
  'the fee-receipts delete policy calls the private helper');

select * from finish();
rollback;
