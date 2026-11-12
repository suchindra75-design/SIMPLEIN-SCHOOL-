-- SIMPLEIN SCHOOL ERP · One round trip for the parent's family context.
-- Forward-only; re-runnable.
--
-- WHY: every parent page started with three dependent queries before any
-- page data (parents → student_parents → students). Each is a network round
-- trip from the app server to the database, so on a hosted setup the chain
-- costs 3 × the round-trip time on every parent page.
--
-- WHAT: public.my_parent_children() returns, in one call, the caller's active
-- parent profile in their school and the linked children (with class and
-- section names), as JSON. NULL when the caller has no parent profile.
-- SECURITY INVOKER: it runs with the caller's row-level security, so it can
-- return nothing the three separate queries could not.
-- Used by lib/services/parents.ts getParentScope (falls back to the three
-- queries when the function is missing, e.g. before this migration).
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.my_parent_children();

CREATE OR REPLACE FUNCTION public.my_parent_children()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'parent_id', p.id,
    'links', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'student_id', sp.student_id,
          'relation', sp.relation,
          'is_primary', sp.is_primary,
          'student', CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', st.id,
            'admission_no', st.admission_no,
            'display_name', st.display_name,
            'class_id', st.class_id,
            'section_id', st.section_id,
            'roll_number', st.roll_number,
            'status', st.status,
            'classes', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name', c.name) END,
            'sections', CASE WHEN se.id IS NULL THEN NULL ELSE jsonb_build_object('name', se.name) END
          ) END
        )
        ORDER BY st.display_name
      )
      FROM public.student_parents sp
      LEFT JOIN public.students st ON st.id = sp.student_id AND st.school_id = p.school_id
      LEFT JOIN public.classes c ON c.id = st.class_id
      LEFT JOIN public.sections se ON se.id = st.section_id
      WHERE sp.parent_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.parents p
  WHERE p.user_id = (SELECT public.current_app_user_id())
    AND p.school_id = (SELECT public.current_school_id())
    AND p.is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_parent_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_parent_children() TO authenticated;
