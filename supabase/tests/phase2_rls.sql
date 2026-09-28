-- SIMPLEIN SCHOOL ERP · Phase 2 live pgTAP RLS suite.
-- Harness: pg_prove via `npx supabase test db --linked`. One transaction;
-- everything rolls back at the end.
--
-- Identity resolution under test (migration 0002):
--   JWT request.jwt.claims.sub  →  public.users.auth_user_id
--   →  users.school_id  →  user_roles  →  policies.
-- RLS assertions run `set local role authenticated` + SET request.jwt.claims.
-- Trigger assertions run as the default connecting role (bypasses RLS) so the
-- trigger itself is isolated as the only possible failure cause.

create extension if not exists pgtap;

begin;
select plan(11); -- 11 assertions below

-- ----------------------------------------------------------------------
-- Fixture actors (fixed UUIDs; rolled back — nothing persists on the DB).
-- ----------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'f2020202-0202-4002-8202-0000000000a1', 'authenticated', 'authenticated', '9d91cb.2.adminA@phase.tests', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f2020202-0202-4002-8202-0000000000a2', 'authenticated', 'authenticated', '9d91cb.2.teacherA@phase.tests', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f2020202-0202-4002-8202-0000000000a3', 'authenticated', 'authenticated', '9d91cb.2.parentA@phase.tests', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f2020202-0202-4002-8202-0000000000b1', 'authenticated', 'authenticated', '9d91cb.2.adminB@phase.tests', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f2020202-0202-4002-8202-0000000000b2', 'authenticated', 'authenticated', '9d91cb.2.teacherB@phase.tests', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'f2020202-0202-4002-8202-0000000000c1', 'authenticated', 'authenticated', '9d91cb.2.inactiveA@phase.tests', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('f2020202-0202-4002-8202-1000000000a1', 'Phase2 School A', 'phase2-school-a'),
  ('f2020202-0202-4002-8202-1000000000b1', 'Phase2 School B', 'phase2-school-b')
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('f2020202-0202-4002-8202-2000000000a1', 'f2020202-0202-4002-8202-0000000000a1', 'f2020202-0202-4002-8202-1000000000a1', 'phase2.adminA@phase.tests', 'Phase2 Admin A'),
  ('f2020202-0202-4002-8202-2000000000a2', 'f2020202-0202-4002-8202-0000000000a2', 'f2020202-0202-4002-8202-1000000000a1', 'phase2.teacherA@phase.tests', 'Phase2 Teacher A'),
  ('f2020202-0202-4002-8202-2000000000a3', 'f2020202-0202-4002-8202-0000000000a3', 'f2020202-0202-4002-8202-1000000000a1', 'phase2.parentA@phase.tests', 'Phase2 Parent A'),
  ('f2020202-0202-4002-8202-2000000000b1', 'f2020202-0202-4002-8202-0000000000b1', 'f2020202-0202-4002-8202-1000000000b1', 'phase2.adminB@phase.tests', 'Phase2 Admin B'),
  ('f2020202-0202-4002-8202-2000000000b2', 'f2020202-0202-4002-8202-0000000000b2', 'f2020202-0202-4002-8202-1000000000b1', 'phase2.teacherB@phase.tests', 'Phase2 Teacher B'),
  ('f2020202-0202-4002-8202-2000000000c1', 'f2020202-0202-4002-8202-0000000000c1', 'f2020202-0202-4002-8202-1000000000a1', 'phase2.inactiveA@phase.tests', 'Phase2 Inactive A')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f2020202-0202-4002-8202-2000000000a1', 'SCHOOL_ADMIN'),
  ('f2020202-0202-4002-8202-2000000000a2', 'TEACHER'),
  ('f2020202-0202-4002-8202-2000000000a3', 'PARENT'),
  ('f2020202-0202-4002-8202-2000000000b1', 'SCHOOL_ADMIN'),
  ('f2020202-0202-4002-8202-2000000000b2', 'TEACHER'),
  ('f2020202-0202-4002-8202-2000000000c1', 'TEACHER')
on conflict do nothing;

-- (Superuser) flip the inactive user AFTER roles exist; trigger parity requires it runs
-- pre-impersonation so the flag is truly stored.
update public.users set is_active = false
 where id = 'f2020202-0202-4002-8202-2000000000c1';

-- RLS checks run as authenticated with claims; this single SET keeps them valid.
set local role authenticated;

-- ----------------------------------------------------------------------
-- 1. Tenant isolation of school reads.
-- ----------------------------------------------------------------------
set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000a1"}';
select is(
  (select count(*)::int from public.schools where id = 'f2020202-0202-4002-8202-1000000000a1'),
  1, 'tenant isolation: School A admin sees own school row');

set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000b1"}';
select is(
  (select count(*)::int from public.schools where id = 'f2020202-0202-4002-8202-1000000000a1'),
  0, 'tenant isolation: School B admin cannot read School A row');

-- ----------------------------------------------------------------------
-- 2. Cross-school write attempt hits zero rows (policy filters it out).
-- ----------------------------------------------------------------------
-- Run as School B admin against School A's school row:
set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000b1"}';
update public.schools set name = 'Hijacked'
 where id = 'f2020202-0202-4002-8202-1000000000a1';
select is(
  (select count(*)::int from public.schools where name = 'Hijacked'),
  0, 'cross-school write blocked: School B admin update had zero effect on School A');

-- ----------------------------------------------------------------------
-- 3. Trigger denials — run as connecting role (superuser) so ONLY the trigger
--    can fail (RLS bypassed), isolating trigger behavior itself.
-- ----------------------------------------------------------------------
reset role;

select throws_ok(
  $$ update public.users set school_id = 'f2020202-0202-4002-8202-1000000000b1'
      where id = 'f2020202-0202-4002-8202-2000000000a3' $$,
  'identity columns are immutable via row-level access',
  'trigger: user cannot be moved to another school');

select throws_ok(
  $$ update public.users set is_active = false
      where id = 'f2020202-0202-4002-8202-2000000000a1' $$,
  'identity columns are immutable via row-level access',
  'trigger: privilege/status flags cannot change via row-level access');

-- ----------------------------------------------------------------------
-- 4. Role self-grant has no INSERT policy for authenticated users.
-- ----------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000a3"}';
select throws_ok(
  $$ insert into public.user_roles (user_id, role)
      values ('f2020202-0202-4002-8202-2000000000a3', 'SCHOOL_ADMIN') $$,
  '42501', -- SQLSTATE insufficient_privilege (RLS violation)
  'RLS: parent cannot self-grant SCHOOL_ADMIN through user_roles');

-- ----------------------------------------------------------------------
-- 5. Inactive users resolve to nothing (fail closed at RLS helpers).
-- ----------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000c1"}';
select is(
  (select count(*)::int from public.schools where id = 'f2020202-0202-4002-8202-1000000000a1'),
  0, 'inactive user sees zero rows (current_school_id filters is_active)');

select is(
  (select count(*)::int from public.users where school_id = 'f2020202-0202-4002-8202-1000000000a1'),
  0, 'inactive user sees zero School-A users');

-- ----------------------------------------------------------------------
-- 6. Unauthenticated claim yields no tenant context.
-- ----------------------------------------------------------------------
reset role;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000000"}';
set local role authenticated;
select is(
  public.current_school_id(),
  null,
  'anonymous claim yields no tenant context (fail closed)');

-- ----------------------------------------------------------------------
-- 7. School correct reads hold with claims set (sanity).
-- ----------------------------------------------------------------------
reset role;

-- Authenticated School A admin sees ALL School-A users (fixture count = 6).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000a1"}';
select is(
  (select count(*)::int from public.users where school_id = 'f2020202-0202-4002-8202-1000000000a1'),
  6, 'admin reads all School-A users (fixture-sized)');

-- School A users are never visible to School B.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f2020202-0202-4002-8202-0000000000b1"}';
select is(
  (select count(*)::int from public.users where school_id = 'f2020202-0202-4002-8202-1000000000a1'),
  0, 'School B admin sees zero School-A users');

select * from finish();
rollback;
