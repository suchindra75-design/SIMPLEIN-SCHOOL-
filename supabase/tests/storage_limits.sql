-- SIMPLEIN SCHOOL ERP · Storage bucket limits (migration 0023).
-- Every app bucket is private and has a size limit and an allowed-type list,
-- so direct Storage uploads with a user session cannot bypass the app's limits.
create extension if not exists pgtap;
begin;
select plan(5);

select is(
  (select count(*)::int from storage.buckets where id in ('student-photos','teacher-photos','homework-attachments','notice-attachments','fee-receipts','pyqs','report-cards')),
  7, 'all 7 app buckets exist');
select is(
  (select count(*)::int from storage.buckets where public),
  0, 'no bucket is public');
select is(
  (select count(*)::int from storage.buckets where id in ('student-photos','teacher-photos','homework-attachments','notice-attachments','fee-receipts','pyqs','report-cards')
     and file_size_limit is not null and allowed_mime_types is not null and cardinality(allowed_mime_types) > 0),
  7, 'every app bucket has a size limit and an allowed-type list');
select is(
  (select max(file_size_limit)::bigint from storage.buckets where id in ('homework-attachments','notice-attachments','fee-receipts','pyqs')),
  4000000::bigint, 'document buckets accept at most 4,000,000 bytes (fits the 4.5 MB request limit)');
select is(
  (select allowed_mime_types from storage.buckets where id = 'report-cards'),
  array['application/pdf']::text[], 'report-cards accepts PDF only');

select * from finish();
rollback;
