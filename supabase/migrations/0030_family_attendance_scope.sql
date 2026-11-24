-- SIMPLEIN SCHOOL ERP · Family attendance read scope, computed once per query.
-- Forward-only; re-runnable.
--
-- WHY: attendance_sessions_family_select (0018) called
-- family_can_read_attendance_session(id) for every session row, and that
-- function scanned the session's records calling current_student_id() /
-- current_parent_id() per record. At school scale (1,440 students, 60 days)
-- a student's attendance page spent ~5 ms per session: 320 ms per query,
-- two queries per page, ~2 s in total (load test, scripts/seed-scale.mjs).
--
-- WHAT CHANGES: the policy now checks `id IN (SELECT family_attendance_session_ids())`.
-- The new SECURITY DEFINER function returns, once per statement, the sessions
-- holding a record of the caller's own student profile or of a child linked
-- to the caller's parent profile: exactly the rule of the old function
-- (records of the caller's school only, as the policy already required).
-- SECURITY DEFINER is needed for the same reason as before: reading
-- attendance_records from a sessions policy as the caller would recurse
-- through attendance_records' own policy.
-- The old function is kept (unused) so nothing that references it breaks.
--
-- ROLLBACK: re-create attendance_sessions_family_select as in 0018, then
--   DROP FUNCTION IF EXISTS public.family_attendance_session_ids();

CREATE OR REPLACE FUNCTION public.family_attendance_session_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ar.attendance_session_id
  FROM public.attendance_records ar
  WHERE ar.school_id = (SELECT public.current_school_id())
    AND ar.student_id = (SELECT public.current_student_id())
  UNION
  SELECT ar.attendance_session_id
  FROM public.student_parents sp
  JOIN public.attendance_records ar
    ON ar.student_id = sp.student_id
   AND ar.school_id = (SELECT public.current_school_id())
  WHERE sp.parent_id = (SELECT public.current_parent_id());
$$;
REVOKE ALL ON FUNCTION public.family_attendance_session_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_attendance_session_ids() TO authenticated;

DROP POLICY IF EXISTS attendance_sessions_family_select ON public.attendance_sessions;
CREATE POLICY attendance_sessions_family_select ON public.attendance_sessions
  FOR SELECT USING (
    school_id = (SELECT public.current_school_id())
    AND id IN (SELECT public.family_attendance_session_ids())
  );
