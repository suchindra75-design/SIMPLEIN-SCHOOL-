-- SIMPLEIN SCHOOL ERP · Parent read scope, computed once per query.
-- Forward-only; re-runnable.
--
-- WHY: the read policies of attendance_records, marks and student_enrollments
-- call parent_can_access_student(student_id) for every row. Load test
-- (scripts/seed-scale.mjs): ~1.2 ms per row, so a parent's 60-day attendance
-- query spent ~75 ms on the check alone, more with siblings or more history.
--
-- WHAT CHANGES: in those policies only, the call
--   parent_can_access_student(student_id)
-- becomes
--   ((SELECT is_school_admin()) OR student_id IN (SELECT parent_linked_student_ids()))
-- which is the definition of parent_can_access_student (0003) evaluated once
-- per query (hashed list of the caller's linked children). student_id is NOT
-- NULL in all three tables, so IN and EXISTS agree. Other uses of the
-- function (subquery arguments, INSERT checks) are left as they are.
--
-- ROLLBACK: re-create the three policies from 0012/0018/0019/0020, then
--   DROP FUNCTION IF EXISTS public.parent_linked_student_ids();

CREATE OR REPLACE FUNCTION public.parent_linked_student_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.student_id FROM public.student_parents sp
  WHERE sp.parent_id = (SELECT public.current_parent_id());
$$;
REVOKE ALL ON FUNCTION public.parent_linked_student_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_linked_student_ids() TO authenticated;

DO $$
DECLARE
  p RECORD;
  v_new TEXT;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('attendance_records', 'marks', 'student_enrollments')
      AND cmd = 'SELECT'
      AND qual ~ '(?<![.\w])(public\.)?parent_can_access_student\(student_id\)'
  LOOP
    v_new := regexp_replace(
      p.qual,
      '(?<![.\w])(?:public\.)?parent_can_access_student\(student_id\)',
      '(( SELECT public.is_school_admin() ) OR (student_id IN ( SELECT public.parent_linked_student_ids() )))',
      'g'
    );
    EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, v_new);
  END LOOP;
END;
$$;
