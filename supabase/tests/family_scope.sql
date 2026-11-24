-- SIMPLEIN SCHOOL ERP · Family read scope after the performance rewrites
-- (migrations 0029–0032). Parents see attendance sessions and children of
-- their own family only; students their own; my_parent_children() returns
-- the caller's family only; anon cannot call it; the scope helpers no longer
-- call session lookups per row. One transaction; rolls back at the end.

create extension if not exists pgtap;
begin;
select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','0f310f31-0f31-4f31-8f31-0000000000a1','authenticated','authenticated','fs.parent1@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0f310f31-0f31-4f31-8f31-0000000000a2','authenticated','authenticated','fs.parent2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0f310f31-0f31-4f31-8f31-0000000000a3','authenticated','authenticated','fs.student2@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-0000-0000-000000000000','0f310f31-0f31-4f31-8f31-0000000000a4','authenticated','authenticated','fs.admin@phase.tests','',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.schools (id, name, slug) values
  ('0f310f31-0f31-4f31-8f31-1000000000a1','FamScope School','famscope-school')
on conflict (id) do nothing;
insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('0f310f31-0f31-4f31-8f31-1100000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;
insert into public.users (id, auth_user_id, school_id, email, full_name) values
  ('0f310f31-0f31-4f31-8f31-2000000000a1','0f310f31-0f31-4f31-8f31-0000000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','fs.parent1@phase.tests','Parent One'),
  ('0f310f31-0f31-4f31-8f31-2000000000a2','0f310f31-0f31-4f31-8f31-0000000000a2','0f310f31-0f31-4f31-8f31-1000000000a1','fs.parent2@phase.tests','Parent Two'),
  ('0f310f31-0f31-4f31-8f31-2000000000a3','0f310f31-0f31-4f31-8f31-0000000000a3','0f310f31-0f31-4f31-8f31-1000000000a1','fs.student2@phase.tests','Student Two'),
  ('0f310f31-0f31-4f31-8f31-2000000000a4','0f310f31-0f31-4f31-8f31-0000000000a4','0f310f31-0f31-4f31-8f31-1000000000a1','fs.admin@phase.tests','Admin')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('0f310f31-0f31-4f31-8f31-2000000000a1','PARENT'),
  ('0f310f31-0f31-4f31-8f31-2000000000a2','PARENT'),
  ('0f310f31-0f31-4f31-8f31-2000000000a3','STUDENT'),
  ('0f310f31-0f31-4f31-8f31-2000000000a4','SCHOOL_ADMIN')
on conflict do nothing;
insert into public.classes (id, school_id, name, order_index) values
  ('0f310f31-0f31-4f31-8f31-3000000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','Grade 5',5)
on conflict (id) do nothing;
insert into public.sections (id, school_id, class_id, name) values
  ('0f310f31-0f31-4f31-8f31-5000000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-3000000000a1','A'),
  ('0f310f31-0f31-4f31-8f31-5000000000a2','0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-3000000000a1','B')
on conflict (id) do nothing;
insert into public.students (id, school_id, admission_no, first_name, last_name, display_name, class_id, section_id, status, user_id) values
  ('0f310f31-0f31-4f31-8f31-6000000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','FS-1','Asha','FS','Asha FS','0f310f31-0f31-4f31-8f31-3000000000a1','0f310f31-0f31-4f31-8f31-5000000000a1','active', null),
  ('0f310f31-0f31-4f31-8f31-6000000000a2','0f310f31-0f31-4f31-8f31-1000000000a1','FS-2','Bala','FS','Bala FS','0f310f31-0f31-4f31-8f31-3000000000a1','0f310f31-0f31-4f31-8f31-5000000000a2','active','0f310f31-0f31-4f31-8f31-2000000000a3')
on conflict (id) do nothing;
insert into public.parents (id, school_id, user_id, full_name) values
  ('0f310f31-0f31-4f31-8f31-4000000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-2000000000a1','Parent One'),
  ('0f310f31-0f31-4f31-8f31-4000000000a2','0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-2000000000a2','Parent Two')
on conflict (id) do nothing;
insert into public.student_parents (student_id, parent_id, relation, is_primary) values
  ('0f310f31-0f31-4f31-8f31-6000000000a1','0f310f31-0f31-4f31-8f31-4000000000a1','mother', true)
on conflict do nothing;
-- One attendance session per section, one record each.
insert into public.attendance_sessions (id, school_id, academic_year_id, section_id, attendance_date, status, created_by, updated_by) values
  ('0f310f31-0f31-4f31-8f31-7000000000a1','0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-1100000000a1','0f310f31-0f31-4f31-8f31-5000000000a1','2026-11-02','SUBMITTED','0f310f31-0f31-4f31-8f31-2000000000a4','0f310f31-0f31-4f31-8f31-2000000000a4'),
  ('0f310f31-0f31-4f31-8f31-7000000000a2','0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-1100000000a1','0f310f31-0f31-4f31-8f31-5000000000a2','2026-11-02','SUBMITTED','0f310f31-0f31-4f31-8f31-2000000000a4','0f310f31-0f31-4f31-8f31-2000000000a4')
on conflict (id) do nothing;
insert into public.attendance_records (school_id, attendance_session_id, student_id, status, updated_by) values
  ('0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-7000000000a1','0f310f31-0f31-4f31-8f31-6000000000a1','PRESENT','0f310f31-0f31-4f31-8f31-2000000000a4'),
  ('0f310f31-0f31-4f31-8f31-1000000000a1','0f310f31-0f31-4f31-8f31-7000000000a2','0f310f31-0f31-4f31-8f31-6000000000a2','ABSENT','0f310f31-0f31-4f31-8f31-2000000000a4')
on conflict do nothing;

set local role authenticated;

-- Parent One (child Asha, section A)
set local "request.jwt.claims" = '{"sub":"0f310f31-0f31-4f31-8f31-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.attendance_sessions where school_id = '0f310f31-0f31-4f31-8f31-1000000000a1'), 1,
  'parent sees only the session holding their child''s record');
select is((select section_id from public.attendance_sessions where school_id = '0f310f31-0f31-4f31-8f31-1000000000a1'),
  '0f310f31-0f31-4f31-8f31-5000000000a1'::uuid, 'that is the child''s section');
select is((public.my_parent_children() ->> 'parent_id'), '0f310f31-0f31-4f31-8f31-4000000000a1', 'my_parent_children: own parent id');
select is(jsonb_array_length(public.my_parent_children() -> 'links'), 1, 'my_parent_children: one linked child');
select is((public.my_parent_children() -> 'links' -> 0 -> 'student' ->> 'admission_no'), 'FS-1', 'my_parent_children: the linked child');

-- Parent Two (no children)
set local "request.jwt.claims" = '{"sub":"0f310f31-0f31-4f31-8f31-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from public.attendance_sessions where school_id = '0f310f31-0f31-4f31-8f31-1000000000a1'), 0,
  'a parent without linked children sees no sessions');
select is(jsonb_array_length(public.my_parent_children() -> 'links'), 0, 'my_parent_children: no children, no leak');

-- Student Two (section B)
set local "request.jwt.claims" = '{"sub":"0f310f31-0f31-4f31-8f31-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.attendance_sessions where school_id = '0f310f31-0f31-4f31-8f31-1000000000a1'), 1,
  'student sees only their own session');
select is((select section_id from public.attendance_sessions where school_id = '0f310f31-0f31-4f31-8f31-1000000000a1'),
  '0f310f31-0f31-4f31-8f31-5000000000a2'::uuid, 'the student''s own section');
select is(public.my_parent_children(), null, 'my_parent_children: NULL for a non-parent');

-- Admin
set local "request.jwt.claims" = '{"sub":"0f310f31-0f31-4f31-8f31-0000000000a4","role":"authenticated"}';
select is((select count(*)::int from public.attendance_sessions where school_id = '0f310f31-0f31-4f31-8f31-1000000000a1'), 2,
  'admin sees every session of the school');

reset role;
select ok(not has_function_privilege('anon', 'public.my_parent_children()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.family_attendance_session_ids()', 'EXECUTE'),
  'anon cannot call the family helpers');
select ok(
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
    where n.nspname in ('public','private') and l.lanname = 'sql'
      and p.proname not in ('current_school_id','current_app_user_id','is_school_admin','current_parent_id','current_student_id','current_teacher_id','has_app_role')
      and p.prosrc ~ '(?<!SELECT )(?<![.\w])(public\.)?(current_school_id|current_app_user_id|is_school_admin|current_parent_id|current_student_id|current_teacher_id)\(\)'),
  'scope helpers evaluate session lookups once per call (0031)');

select * from finish();
rollback;
