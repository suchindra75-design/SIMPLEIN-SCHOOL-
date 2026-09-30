-- SIMPLEIN SCHOOL ERP · Phase 14: student exam-context reads.
-- Forward-only; does not touch 0001–0013.
--
-- ROOT CAUSE (proven live, Phase 14 runtime E2E): students hold no read grant
-- on exams / exam_subjects / exam_schedules, so every service flow that loads
-- the exam context first (getStudentResult → 404, report-card preview →
-- downstream 404, exam schedules) is unreachable for students — even though
-- marks_select itself was fixed for students in 0013 and the API contract
-- promises students their own class's exams, published results, and report
-- cards.
--
-- FIX (minimum, tenant-safe): STUDENT branches mirroring the existing PARENT
-- shape, keyed on the student's OWN class (current placement, same source as
-- getStudentScope) + own school. Publish gating stays where it belongs: the
-- marks/report-cards policies (unchanged) still hide unpublished results.
-- No new write grants; admin/teacher/parent branches byte-identical.

-- exams: own class (+ own school).
DROP POLICY IF EXISTS exams_select ON public.exams;
CREATE POLICY exams_select ON public.exams
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.sections s
          WHERE s.class_id = exams.class_id
            AND public.teacher_can_access_section(s.id)
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND EXISTS (
          SELECT 1 FROM public.student_parents sp
          JOIN public.students st ON st.id = sp.student_id
          WHERE sp.parent_id = public.current_parent_id()
            AND st.class_id = exams.class_id
        )
      )
      OR (
        public.has_app_role('STUDENT')
        AND exams.class_id = (SELECT st.class_id FROM public.students st
                              WHERE st.id = public.current_student_id())
      )
    )
  );

-- exam_subjects: own class via the exam join.
DROP POLICY IF EXISTS exam_subjects_select ON public.exam_subjects;
CREATE POLICY exam_subjects_select ON public.exam_subjects
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.exams e
          JOIN public.sections s ON s.class_id = e.class_id
          WHERE e.id = exam_subjects.exam_id
            AND public.teacher_can_access_section(s.id)
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND EXISTS (
          SELECT 1 FROM public.exams e
          JOIN public.students st ON st.class_id = e.class_id
          JOIN public.student_parents sp ON sp.student_id = st.id
          WHERE e.id = exam_subjects.exam_id
            AND sp.parent_id = public.current_parent_id()
        )
      )
      OR (
        public.has_app_role('STUDENT')
        AND EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_subjects.exam_id
            AND e.class_id = (SELECT st.class_id FROM public.students st
                              WHERE st.id = public.current_student_id())
        )
      )
    )
  );

-- exam_schedules: own class via the subject → exam join.
DROP POLICY IF EXISTS exam_schedules_select ON public.exam_schedules;
CREATE POLICY exam_schedules_select ON public.exam_schedules
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.exam_subjects es
          JOIN public.exams e ON e.id = es.exam_id
          JOIN public.sections s ON s.class_id = e.class_id
          WHERE es.id = exam_schedules.exam_subject_id
            AND public.teacher_can_access_section(s.id)
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND EXISTS (
          SELECT 1 FROM public.exam_subjects es
          JOIN public.exams e ON e.id = es.exam_id
          JOIN public.students st ON st.class_id = e.class_id
          JOIN public.student_parents sp ON sp.student_id = st.id
          WHERE es.id = exam_schedules.exam_subject_id
            AND sp.parent_id = public.current_parent_id()
        )
      )
      OR (
        public.has_app_role('STUDENT')
        AND EXISTS (
          SELECT 1 FROM public.exam_subjects es
          JOIN public.exams e ON e.id = es.exam_id
          WHERE es.id = exam_schedules.exam_subject_id
            AND e.class_id = (SELECT st.class_id FROM public.students st
                              WHERE st.id = public.current_student_id())
        )
      )
    )
  );
