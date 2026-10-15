-- SIMPLEIN SCHOOL ERP · 0020 — RLS read-path performance for families and teachers.
--
-- Read policies on the portal tables evaluated scope per ROW: either through a
-- per-row SECURITY DEFINER call (parent_can_access_student(id), …) or through
-- EXISTS subqueries over other RLS-protected tables, whose own policies were
-- re-applied inside the subquery. Locally a parent's timetable query took
-- ~4.8 s for 25 slots, and the cost grows with school size.
--
-- Fix: STABLE SECURITY DEFINER helpers return the caller's scope as a SET
-- (their students, sections, classes, exams, teachers). Policies test
-- membership with `col IN (SELECT helper())`, which Postgres evaluates once per
-- statement (hashed) instead of once per row. Each helper carries the same role
-- condition as the branch it replaces.
--
-- Semantics are unchanged (pgTAP phase2–12 suites pass unmodified), including
-- the documented rule that parents may read every timetable slot of their own
-- school (phase8 C).

-- ------------------------------------------------------------- scope helpers

CREATE OR REPLACE FUNCTION public.family_student_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_student_id()
  WHERE public.current_student_id() IS NOT NULL
  UNION
  SELECT sp.student_id FROM public.student_parents sp
  WHERE public.has_app_role('PARENT') AND sp.parent_id = public.current_parent_id();
$$;

CREATE OR REPLACE FUNCTION public.family_section_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT st.section_id FROM public.students st
  WHERE st.id IN (SELECT public.family_student_ids()) AND st.section_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.family_class_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT st.class_id FROM public.students st
  WHERE st.id IN (SELECT public.family_student_ids()) AND st.class_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.teacher_section_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM public.sections s
  WHERE public.has_app_role('TEACHER') AND s.class_teacher_id = public.current_teacher_id()
  UNION
  SELECT ts.section_id FROM public.teacher_subjects ts
  WHERE public.has_app_role('TEACHER') AND ts.teacher_id = public.current_teacher_id();
$$;

CREATE OR REPLACE FUNCTION public.teacher_class_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT s.class_id FROM public.sections s
  WHERE s.id IN (SELECT public.teacher_section_ids());
$$;

-- Exams of the caller's classes (teacher scope or family scope).
CREATE OR REPLACE FUNCTION public.scoped_exam_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.exams e
  WHERE e.school_id = public.current_school_id()
    AND (
      e.class_id IN (SELECT public.teacher_class_ids())
      OR e.class_id IN (SELECT public.family_class_ids())
    );
$$;

-- Teachers a family member may see: class teacher, subject teacher or
-- timetabled teacher of one of their sections.
CREATE OR REPLACE FUNCTION public.family_teacher_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.class_teacher_id FROM public.sections s
  WHERE s.id IN (SELECT public.family_section_ids()) AND s.class_teacher_id IS NOT NULL
  UNION
  SELECT ts.teacher_id FROM public.teacher_subjects ts
  WHERE ts.section_id IN (SELECT public.family_section_ids())
  UNION
  SELECT tt.teacher_id FROM public.timetable_slots tt
  WHERE tt.section_id IN (SELECT public.family_section_ids()) AND tt.teacher_id IS NOT NULL;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'family_student_ids', 'family_section_ids', 'family_class_ids',
    'teacher_section_ids', 'teacher_class_ids', 'scoped_exam_ids', 'family_teacher_ids'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated', fn);
  END LOOP;
END $$;

-- ------------------------------------------------------------------ policies

DROP POLICY IF EXISTS students_select_scoped ON public.students;
CREATE POLICY students_select_scoped ON public.students
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR id IN (SELECT public.family_student_ids())
      OR section_id IN (SELECT public.teacher_section_ids())
    )
  );

DROP POLICY IF EXISTS student_fees_select ON public.student_fees;
CREATE POLICY student_fees_select ON public.student_fees
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR student_id IN (SELECT public.family_student_ids()))
  );

DROP POLICY IF EXISTS homework_select ON public.homework;
CREATE POLICY homework_select ON public.homework
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR section_id IN (SELECT public.family_section_ids())
      OR section_id IN (SELECT public.teacher_section_ids())
    )
  );

DROP POLICY IF EXISTS timetable_slots_select ON public.timetable_slots;
CREATE POLICY timetable_slots_select ON public.timetable_slots
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR public.has_app_role('PARENT')
      OR section_id IN (SELECT public.family_section_ids())
      OR section_id IN (SELECT public.teacher_section_ids())
    )
  );

DROP POLICY IF EXISTS exams_select ON public.exams;
CREATE POLICY exams_select ON public.exams
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR class_id IN (SELECT public.teacher_class_ids())
      OR class_id IN (SELECT public.family_class_ids())
    )
  );

DROP POLICY IF EXISTS exam_subjects_select ON public.exam_subjects;
CREATE POLICY exam_subjects_select ON public.exam_subjects
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR exam_id IN (SELECT public.scoped_exam_ids()))
  );

DROP POLICY IF EXISTS exam_schedules_select ON public.exam_schedules;
CREATE POLICY exam_schedules_select ON public.exam_schedules
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR exam_subject_id IN (
        SELECT es.id FROM public.exam_subjects es
        WHERE es.exam_id IN (SELECT public.scoped_exam_ids())
      )
    )
  );

DROP POLICY IF EXISTS report_cards_select ON public.report_cards;
CREATE POLICY report_cards_select ON public.report_cards
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (status = 'PUBLISHED' AND student_id IN (SELECT public.family_student_ids()))
      OR (public.has_app_role('TEACHER') AND exam_id IN (SELECT public.scoped_exam_ids()))
    )
  );

DROP POLICY IF EXISTS teachers_select ON public.teachers;
DROP POLICY IF EXISTS teachers_student_select ON public.teachers;
CREATE POLICY teachers_select ON public.teachers
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      user_id = public.current_app_user_id()
      OR public.is_school_admin()
      OR public.has_app_role('TEACHER')
      OR id IN (SELECT public.family_teacher_ids())
    )
  );

DROP POLICY IF EXISTS student_parents_select ON public.student_parents;
CREATE POLICY student_parents_select ON public.student_parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.id = student_parents.student_id AND st.school_id = public.current_school_id()
    )
    AND (
      public.is_school_admin()
      OR parent_id = public.current_parent_id()
      OR student_id IN (
        SELECT st.id FROM public.students st
        WHERE st.section_id IN (SELECT public.teacher_section_ids())
      )
    )
  );

DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (public.has_app_role('TEACHER') AND notices.created_by = public.current_app_user_id())
      OR (
        notices.is_published
        AND notices.is_active
        AND (
          NOT EXISTS (SELECT 1 FROM public.notice_targets nt WHERE nt.notice_id = notices.id)
          OR EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
              AND (
                nt.audience_type = 'SCHOOL'
                OR (nt.audience_type = 'TEACHERS' AND public.has_app_role('TEACHER'))
                OR (nt.audience_type = 'PARENTS' AND public.has_app_role('PARENT'))
                OR (
                  nt.audience_type = 'SECTION'
                  AND (
                    nt.section_id IN (SELECT public.family_section_ids())
                    OR nt.section_id IN (SELECT public.teacher_section_ids())
                  )
                )
                OR (
                  nt.audience_type = 'CLASS'
                  AND (
                    nt.class_id IN (SELECT public.family_class_ids())
                    OR nt.class_id IN (SELECT public.teacher_class_ids())
                  )
                )
              )
          )
        )
      )
    )
  );
