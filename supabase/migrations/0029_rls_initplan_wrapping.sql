-- SIMPLEIN SCHOOL ERP · RLS performance: evaluate session helpers once per query.
-- Forward-only; re-runnable (already-wrapped calls are skipped).
--
-- WHY: policies call session helpers such as public.current_school_id(),
-- public.is_school_admin() and public.has_app_role('PARENT') directly. Postgres
-- then runs these SECURITY DEFINER lookups once PER ROW the query touches
-- (~0.7 ms per row locally: 35 timetable slots = 24 ms; a school with 1,500
-- slots ≈ 1 s per page). Written as a scalar subquery — (SELECT fn()) — the
-- planner evaluates them once per statement as an InitPlan (measured 24 ms →
-- 3 ms, constant in table size). This is Supabase's documented RLS guidance.
--
-- WHAT CHANGES: every policy in schemas public and storage is rewritten so
-- that calls to the argument-free helpers
--   current_school_id(), current_app_user_id(), is_school_admin(),
--   current_parent_id(), current_student_id(), current_teacher_id()
-- and to has_app_role('<constant>') become ( SELECT <call> ). The policies'
-- meaning is unchanged: these functions are STABLE and depend only on the
-- request (JWT), never on the row. Row-dependent helpers (e.g.
-- parent_can_access_student(student_id)) are not touched. Commands, roles and
-- names of the policies are unchanged (ALTER POLICY).
--
-- VERIFY: SELECT policyname, qual FROM pg_policies WHERE qual ~ 'current_school_id\(\)';
--   every match is inside "( SELECT current_school_id() ...".
--
-- ROLLBACK: re-apply the policy definitions from 0001–0028 (or `supabase db
-- reset` without this file). Behaviour is identical either way; only speed differs.

DO $$
DECLARE
  p RECORD;
  v_using TEXT;
  v_check TEXT;
  v_sql TEXT;
  -- Unwrapped zero-argument helpers (not already preceded by "SELECT ").
  re_zero CONSTANT TEXT :=
    '(?<!SELECT )(?<![.\w])((?:public\.)?(?:current_school_id|current_app_user_id|is_school_admin|current_parent_id|current_student_id|current_teacher_id))\(\)';
  -- has_app_role with a constant argument, e.g. has_app_role('PARENT'::app_role).
  re_role CONSTANT TEXT :=
    '(?<!SELECT )(?<![.\w])((?:public\.)?has_app_role)\((''\w+''(?:::(?:public\.)?app_role)?)\)';
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
  LOOP
    v_using := p.qual;
    v_check := p.with_check;
    IF v_using IS NOT NULL THEN
      v_using := regexp_replace(v_using, re_zero, '( SELECT \1() )', 'g');
      v_using := regexp_replace(v_using, re_role, '( SELECT \1(\2) )', 'g');
    END IF;
    IF v_check IS NOT NULL THEN
      v_check := regexp_replace(v_check, re_zero, '( SELECT \1() )', 'g');
      v_check := regexp_replace(v_check, re_role, '( SELECT \1(\2) )', 'g');
    END IF;
    IF v_using IS NOT DISTINCT FROM p.qual AND v_check IS NOT DISTINCT FROM p.with_check THEN
      CONTINUE;
    END IF;
    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_using IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;

-- Guard: nothing unwrapped is left (fails the migration otherwise).
DO $$
DECLARE
  v_left INT;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (
      coalesce(qual, '') || ' ' || coalesce(with_check, '')
    ) ~ '(?<!SELECT )(?<![.\w])(?:public\.)?(?:current_school_id|current_app_user_id|is_school_admin|current_parent_id|current_student_id|current_teacher_id)\(\)';
  IF v_left > 0 THEN
    RAISE EXCEPTION '0029: % policies still call session helpers per row', v_left;
  END IF;
END;
$$;
