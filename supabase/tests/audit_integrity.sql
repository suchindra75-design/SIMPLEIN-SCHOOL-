-- SIMPLEIN SCHOOL ERP · Audit log integrity (migration 0025) pgTAP suite.
-- Proves that school members can still append the app's own audit events,
-- but cannot forge database-written events (fee_payment.db_*,
-- fee_assignment.db_*), cannot add the trigger provenance marker
-- (metadata.via), cannot write fee events without fee access, and cannot
-- choose the timestamp; that the triggers' own rows are still written; and
-- that no role — API user, service role or the connecting owner — can update,
-- delete or truncate audit rows while the triggers are in place. Also checks
-- that API roles hold no TRUNCATE privilege. One transaction; rolls back.

create extension if not exists pgtap;
begin;
select plan(26);

-- ------------------------- fixture (connecting role) -------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','ad25ad25-ad25-4a25-8a25-0000000000a1','authenticated','authenticated','ai.adminA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','ad25ad25-ad25-4a25-8a25-0000000000a4','authenticated','authenticated','ai.teacherA@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','ad25ad25-ad25-4a25-8a25-0000000000b1','authenticated','authenticated','ai.adminB@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('ad25ad25-ad25-4a25-8a25-1000000000a1','AuditInt School A','auditint-school-a'),
  ('ad25ad25-ad25-4a25-8a25-1000000000b1','AuditInt School B','auditint-school-b')
on conflict (id) do nothing;

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('ad25ad25-ad25-4a25-8a25-1100000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('ad25ad25-ad25-4a25-8a25-2000000000a1','ad25ad25-ad25-4a25-8a25-0000000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','ai.adminA@phase.tests','Admin A'),
  ('ad25ad25-ad25-4a25-8a25-2000000000a4','ad25ad25-ad25-4a25-8a25-0000000000a4','ad25ad25-ad25-4a25-8a25-1000000000a1','ai.teacherA@phase.tests','Teacher A'),
  ('ad25ad25-ad25-4a25-8a25-2000000000b1','ad25ad25-ad25-4a25-8a25-0000000000b1','ad25ad25-ad25-4a25-8a25-1000000000b1','ai.adminB@phase.tests','Admin B')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('ad25ad25-ad25-4a25-8a25-2000000000a1','SCHOOL_ADMIN'),
  ('ad25ad25-ad25-4a25-8a25-2000000000a4','TEACHER'),
  ('ad25ad25-ad25-4a25-8a25-2000000000b1','SCHOOL_ADMIN')
on conflict do nothing;

insert into public.classes (id, school_id, name, order_index) values
  ('ad25ad25-ad25-4a25-8a25-3000000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','Grade 7',7)
on conflict (id) do nothing;
insert into public.sections (id, school_id, class_id, name) values
  ('ad25ad25-ad25-4a25-8a25-5000000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-3000000000a1','A')
on conflict (id) do nothing;
insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status) values
  ('ad25ad25-ad25-4a25-8a25-6000000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','AI-1','Asha','AI','Asha AI','ad25ad25-ad25-4a25-8a25-3000000000a1','ad25ad25-ad25-4a25-8a25-5000000000a1','active')
on conflict (id) do nothing;
insert into public.fee_structures (id, school_id, academic_year_id, class_id, name) values
  ('ad25ad25-ad25-4a25-8a25-7000000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-1100000000a1','ad25ad25-ad25-4a25-8a25-3000000000a1','Tuition')
on conflict (id) do nothing;

-- One existing audit row to try to change.
insert into public.audit_logs (id, school_id, actor_id, action, entity, entity_id, metadata) values
  ('ad25ad25-ad25-4a25-8a25-9000000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a1','class.updated','classes','ad25ad25-ad25-4a25-8a25-3000000000a1','{}');

-- ------------------------- teacher (no fee access) -------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"ad25ad25-ad25-4a25-8a25-0000000000a4","role":"authenticated"}';

select lives_ok(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','homework.created','homework',null,'{"title":"x"}') $$,
  'append: a teacher can still append the app''s own events');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','fee_payment.db_voided','fee_payment_records',null,'{}') $$,
  'row-level security', 'forge: a teacher cannot append a database payment-void event');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','fee_assignment.db_reassigned','student_fees',null,'{}') $$,
  'row-level security', 'forge: a teacher cannot append a database assignment event');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','homework.created','homework',null,'{"via":"api_user"}') $$,
  'row-level security', 'forge: the trigger provenance marker (metadata.via) is reserved');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','fee_payment.verified','fee_payment_records',null,'{}') $$,
  'row-level security', 'forge: a teacher cannot append app-level fee events');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','note.added','fee_payment_records',null,'{}') $$,
  'row-level security', 'forge: a teacher cannot append events about fee records under another name');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a1','homework.created','homework',null,'{}') $$,
  'row-level security', 'forge: a teacher cannot append rows in another user''s name');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000b1','ad25ad25-ad25-4a25-8a25-2000000000a4','homework.created','homework',null,'{}') $$,
  'row-level security', 'tenant: a teacher cannot append rows for another school');
select lives_ok(
  $$ insert into public.audit_logs (id, school_id, actor_id, action, entity, entity_id, metadata, created_at)
     values ('ad25ad25-ad25-4a25-8a25-9000000000a4','ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a4','homework.updated','homework',null,'{}','2020-01-01') $$,
  'append: a row with a supplied timestamp is accepted ...');

-- ------------------------- admin -------------------------
set local "request.jwt.claims" = '{"sub":"ad25ad25-ad25-4a25-8a25-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a1','fee_payment.verified','fee_payment_records',null,'{}') $$,
  'append: an admin can append the app''s fee events (logAudit)');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a1','fee_payment.db_verified','fee_payment_records',null,'{"via":"api_user"}') $$,
  'row-level security', 'forge: an admin cannot append a database payment-verification event');
select throws_matching(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-2000000000a1','fee_payment.verified','fee_payment_records',null,'{"via":"database"}') $$,
  'row-level security', 'forge: an admin cannot add the provenance marker to an app event');
-- The database's own rows are still written for API callers (trigger owner, not this policy).
select lives_ok(
  $$ insert into public.student_fees (id, school_id, student_id, fee_structure_id, total_amount)
     values ('ad25ad25-ad25-4a25-8a25-7200000000a1','ad25ad25-ad25-4a25-8a25-1000000000a1','ad25ad25-ad25-4a25-8a25-6000000000a1','ad25ad25-ad25-4a25-8a25-7000000000a1',1000) $$,
  'triggers: an admin creates an assignment through the API');
update public.audit_logs set action = 'changed' where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1';
delete from public.audit_logs where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1';

-- ------------------------- service role -------------------------
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select throws_matching(
  $$ update public.audit_logs set action = 'changed' where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1' $$,
  'cannot be changed or deleted', 'append-only: the service-role key cannot edit an audit row');
select throws_matching(
  $$ delete from public.audit_logs where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1' $$,
  'cannot be changed or deleted', 'append-only: the service-role key cannot delete an audit row');
select throws_matching(
  $$ truncate public.audit_logs $$,
  'cannot be changed or deleted', 'append-only: the service-role key cannot truncate the audit log');
select lives_ok(
  $$ insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
     values ('ad25ad25-ad25-4a25-8a25-1000000000a1', null, 'school.created', 'schools', null, '{}') $$,
  'append: the service role can still append (onboarding writes school.created)');

-- ------------------------- connecting role (owner) -------------------------
reset role;
set local "request.jwt.claims" = '';
select is(
  (select action from public.audit_logs where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1'),
  'class.updated', 'append-only: the admin''s API update and delete had no effect');
select ok(
  (select created_at > now() - interval '1 hour' from public.audit_logs where id = 'ad25ad25-ad25-4a25-8a25-9000000000a4'),
  '... but API callers cannot back-date it: created_at is the server time');
select is(
  (select count(*)::int from public.audit_logs where entity_id = 'ad25ad25-ad25-4a25-8a25-7200000000a1'
     and action = 'fee_assignment.db_created' and actor_id = 'ad25ad25-ad25-4a25-8a25-2000000000a1' and metadata ->> 'via' = 'api_user'),
  1, 'triggers: the database-written event is recorded with the admin as actor');
select throws_matching(
  $$ delete from public.audit_logs where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1' $$,
  'cannot be changed or deleted', 'append-only: the table owner cannot delete rows while the trigger is in place');
select throws_matching(
  $$ update public.audit_logs set metadata = '{}' where id = 'ad25ad25-ad25-4a25-8a25-9000000000a1' $$,
  'cannot be changed or deleted', 'append-only: the table owner cannot edit rows while the trigger is in place');
select is(
  (select count(*)::int from pg_trigger where tgrelid = 'public.audit_logs'::regclass and not tgisinternal and tgenabled = 'O'
     and tgname in ('audit_logs_append_only', 'audit_logs_no_truncate', 'audit_logs_server_time')),
  3, 'append-only: the protecting triggers are enabled');

-- ------------------------- privileges -------------------------
select is(
  (select count(*)::int from pg_tables t
    where t.schemaname = 'public'
      and (has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE')
        or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE'))),
  0, 'privileges: anon and authenticated hold TRUNCATE on no public table');
select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.fee_payment_records', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.student_fees', 'TRUNCATE'),
  'privileges: no TRUNCATE on the audit and fee tables for signed-in users');
select is(
  (select roles::text from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_append'),
  '{authenticated}', 'policy: only signed-in users can append through the API');

select * from finish();
rollback;
