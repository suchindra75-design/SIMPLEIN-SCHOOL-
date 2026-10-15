-- SIMPLEIN SCHOOL ERP · 0016 — enable RLS on public.pyqs.
--
-- 0012 created public.pyqs with its policies (pyqs_select: same school;
-- pyqs_admin_write: school admins only) but never enabled row-level security
-- on the table, so the policies were inert and any authenticated user could
-- read or write every school's past-paper records through PostgREST.
-- Enabling RLS activates the existing policies. Non-destructive: no data or
-- policy changes. Verified by supabase/tests/phase12_rls.sql (section D) and
-- supabase/tests/rls_coverage.sql.

ALTER TABLE public.pyqs ENABLE ROW LEVEL SECURITY;
