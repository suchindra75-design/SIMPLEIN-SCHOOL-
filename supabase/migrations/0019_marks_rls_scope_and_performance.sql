-- SIMPLEIN SCHOOL ERP · 0019 — marks RLS: section-level teacher scope + performance.
--
-- Problem 1 (performance): marks_select / marks_write / marks_update (0006,
-- 0013) embed joins over exam_subjects, exams, sections and teacher_subjects —
-- all RLS-protected — so the planner inlines those tables' policies, which
-- reference further tables. Planning a one-row upsert took ~5 s locally and the
-- 8 s statement_timeout cancelled multi-row mark saves. The validate/tenant
-- triggers (SECURITY INVOKER) also re-planned RLS for their lookups.
-- Fix: move the policy logic into STABLE SECURITY DEFINER helpers (opaque to
-- the planner, fixed search_path). Measured locally: one-row upsert ~5 s → <1 s
-- (the SECURITY INVOKER consistency triggers are unchanged).
--
-- Problem 2 (scope): teachers could read and WRITE marks for every section of
-- the exam's class, in any subject, if they taught the class anywhere.
--   * Read:  marks of students in a section the teacher class-teaches or
--            teaches any subject in (all subjects of those students).
--   * Write: only a section the teacher class-teaches (all subjects) or
--            teaches THIS subject in — the rule in lib/services/marks.ts
--            (markableSectionIds).
-- A student's section is their current placement or their enrollment for the
-- exam's academic year.

CREATE OR REPLACE FUNCTION public.exam_subject_is_locked(es_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT es.is_locked FROM public.exam_subjects es WHERE es.id = es_id), false);
$$;

-- Sections (of the exam's class) the student belongs to for that exam.
CREATE OR REPLACE FUNCTION public.teacher_marks_access(es_id UUID, stu UUID, same_subject BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_subjects es
    JOIN public.exams e ON e.id = es.exam_id
    JOIN public.sections s ON s.class_id = e.class_id
    WHERE es.id = es_id
      AND (
        s.id = (SELECT st.section_id FROM public.students st WHERE st.id = stu)
        OR s.id IN (
          SELECT se.section_id FROM public.student_enrollments se
          WHERE se.student_id = stu AND se.academic_year_id = e.academic_year_id
        )
      )
      AND (
        s.class_teacher_id = public.current_teacher_id()
        OR EXISTS (
          SELECT 1 FROM public.teacher_subjects ts
          WHERE ts.section_id = s.id
            AND ts.teacher_id = public.current_teacher_id()
            AND (NOT same_subject OR ts.subject_id = es.subject_id)
          )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_mark(es_id UUID, stu UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.teacher_marks_access(es_id, stu, true); $$;

CREATE OR REPLACE FUNCTION public.teacher_can_view_mark(es_id UUID, stu UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.teacher_marks_access(es_id, stu, false); $$;

REVOKE ALL ON FUNCTION public.exam_subject_is_locked(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_marks_access(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_can_mark(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_can_view_mark(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_subject_is_locked(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_marks_access(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_mark(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_view_mark(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS marks_select ON public.marks;
CREATE POLICY marks_select ON public.marks
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (student_id = public.current_student_id() AND public.exam_subject_is_published(exam_subject_id))
      OR (public.has_app_role('TEACHER') AND public.teacher_can_view_mark(exam_subject_id, student_id))
      OR (
        public.has_app_role('PARENT')
        AND public.exam_subject_is_published(exam_subject_id)
        AND public.parent_can_access_student(student_id)
      )
    )
  );

DROP POLICY IF EXISTS marks_write ON public.marks;
CREATE POLICY marks_write ON public.marks
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND NOT public.exam_subject_is_locked(exam_subject_id)
        AND public.teacher_can_mark(exam_subject_id, student_id)
      )
    )
  );

DROP POLICY IF EXISTS marks_update ON public.marks;
CREATE POLICY marks_update ON public.marks
  FOR UPDATE USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND NOT public.exam_subject_is_locked(exam_subject_id)
        AND public.teacher_can_mark(exam_subject_id, student_id)
      )
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND NOT public.exam_subject_is_locked(exam_subject_id)
        AND public.teacher_can_mark(exam_subject_id, student_id)
      )
    )
  );
