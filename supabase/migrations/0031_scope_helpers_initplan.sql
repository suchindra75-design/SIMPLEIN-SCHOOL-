-- SIMPLEIN SCHOOL ERP · Scope helpers: evaluate session lookups once per call.
-- Forward-only; re-runnable (already-wrapped calls are skipped).
--
-- WHY: 0029 made policies evaluate session helpers once per query, but the
-- SQL scope helpers the policies call (teacher_section_ids(),
-- family_student_ids(), teacher_can_access_section(), ...) still call
-- current_teacher_id(), has_app_role('TEACHER') etc. inside their WHERE
-- clauses, i.e. once per row they scan. Load test (scripts/seed-scale.mjs):
-- teacher_section_ids() took 36 ms to scan 48 sections + 240 subject
-- assignments, so every exams/timetable/homework query of a teacher paid it.
--
-- WHAT CHANGES: in every LANGUAGE sql function of schemas public and private
-- that is not itself one of the base session helpers, calls to
--   current_school_id(), current_app_user_id(), is_school_admin(),
--   current_parent_id(), current_student_id(), current_teacher_id(),
--   has_app_role('<constant>')
-- become scalar subqueries ( SELECT … ), evaluated once per function call
-- instead of once per scanned row. Same results: these are STABLE and depend
-- only on the request. Function signatures, owners, SECURITY DEFINER,
-- search_path and grants are unchanged (CREATE OR REPLACE keeps grants).
-- Trigger functions (plpgsql) are not touched.
--
-- ROLLBACK: re-run the CREATE OR REPLACE FUNCTION statements of 0003, 0018,
-- 0020, 0027 and 0028 for the affected functions.

DO $$
DECLARE
  f RECORD;
  v_def TEXT;
  v_new TEXT;
  re_zero CONSTANT TEXT :=
    '(?<!SELECT )(?<![.\w])((?:public\.)?(?:current_school_id|current_app_user_id|is_school_admin|current_parent_id|current_student_id|current_teacher_id))\(\)';
  re_role CONSTANT TEXT :=
    '(?<!SELECT )(?<![.\w])((?:public\.)?has_app_role)\((''\w+''(?:::(?:public\.)?app_role)?)\)';
BEGIN
  FOR f IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN ('public', 'private')
      AND l.lanname = 'sql'
      AND p.prokind = 'f'
      AND p.proname NOT IN (
        'current_school_id', 'current_app_user_id', 'is_school_admin',
        'current_parent_id', 'current_student_id', 'current_teacher_id', 'has_app_role'
      )
  LOOP
    v_def := pg_get_functiondef(f.oid);
    v_new := regexp_replace(v_def, re_zero, '( SELECT \1() )', 'g');
    v_new := regexp_replace(v_new, re_role, '( SELECT \1(\2) )', 'g');
    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;
END;
$$;
