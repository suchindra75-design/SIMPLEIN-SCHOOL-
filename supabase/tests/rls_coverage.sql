-- SIMPLEIN SCHOOL ERP · RLS coverage guard (pgTAP).
-- Every application table in `public` must have row-level security enabled
-- and at least one policy; a table with policies but RLS off (as public.pyqs
-- was before 0016) silently exposes every school's rows through PostgREST.

create extension if not exists pgtap;
begin;
select plan(2);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '',
  'every public table has row-level security enabled'
);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  '',
  'every public table has at least one RLS policy'
);

select * from finish();
rollback;
