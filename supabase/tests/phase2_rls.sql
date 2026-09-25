-- SIMPLEIN SCHOOL ERP · Phase 2 RLS verification (LIVE DATABASE ONLY).
-- Run against a staging Supabase project AFTER applying migrations, as two
-- different authenticated users (School A admin, School B admin/teacher).
-- These checks cannot run in CI without a live JWT; the equivalent server-
-- boundary logic is unit-tested in lib/auth/session.test.ts.
--
-- Usage (psql with a School A admin JWT in $JWT_A and School B in $JWT_B):
--   SET request.jwt.claims TO '{"sub":"<auth_user_id_A>"}';  -- via supabase test harness
--   ... run each block, confirm ALLOWED/DENIED outcomes below.

-- A. School A admin reads own school → 1 row (ALLOWED)
-- SELECT id, slug FROM public.schools;  -- expect: only School A

-- B. School A admin reads users → own + same-school only (ALLOWED, bounded)
-- SELECT email, school_id FROM public.users;  -- expect: no School B rows

-- C. Cross-school write attempt fails (DENIED)
-- UPDATE public.schools SET name = 'hijack' WHERE slug = '<school-b-slug>';
-- expect: 0 rows affected (policy filters to own school)

-- D. Identity escalation attempt fails (DENIED via trigger)
-- UPDATE public.users SET is_active = false WHERE id = public.current_app_user_id();
-- expect: ERROR 'identity columns are immutable via row-level access'

-- E. Tenant change attempt fails (DENIED via trigger)
-- UPDATE public.users SET school_id = '<school-b-id>' WHERE id = public.current_app_user_id();
-- expect: ERROR 'identity columns are immutable via row-level access'

-- F. Role self-grant fails (DENIED — no authenticated INSERT policy)
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES (public.current_app_user_id(), 'SCHOOL_ADMIN');
-- expect: ERROR new row violates row-level security policy

-- G. Repeat A–F with the School B JWT and confirm symmetric isolation:
--    B sees only School B rows; A rows are invisible (never 403-with-existence).

-- H. Inactive user: set users.is_active=false (service role), then as that user:
-- SELECT * FROM public.schools;  -- expect: 0 rows (current_school_id() filters inactive)
