-- SIMPLEIN SCHOOL ERP · Phase 5: Exams + Exam Schedules.
-- Extends 0001–0004 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Model (see docs/ARCHITECTURE.md §20):
-- - exams: class-scoped exam events per academic year (configurable names).
-- - exam_subjects: per-subject configuration (max/passing marks) + schedule
--   date/time. NO marks/results fields in this phase (marks land in Phase 6).
-- - exam_schedules: room/invigilator detail (1:1), kept separate so schedule
--   edits never touch marks configuration.
-- - Duplicate/conflicting definitions prevented at the DB:
--   UNIQUE(school_id, academic_year_id, class_id, name) + UNIQUE(exam_id, subject_id).

-- 1. exams ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL CHECK (ends_on >= starts_on),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One "Unit Test 1" per class per year: duplicate definitions blocked.
  UNIQUE (school_id, academic_year_id, class_id, name)
);
CREATE INDEX IF NOT EXISTS exams_school_class_idx
  ON public.exams (school_id, class_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS exams_school_year_idx
  ON public.exams (school_id, academic_year_id);
DROP TRIGGER IF EXISTS exams_touch ON public.exams;
CREATE TRIGGER exams_touch BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. exam_subjects ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  max_marks NUMERIC(6,2) NOT NULL CHECK (max_marks > 0),
  passing_marks NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (passing_marks >= 0),
  exam_date DATE,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, subject_id),
  -- Configuration validity enforced at the DB, not just app code.
  CONSTRAINT exam_subjects_passing_within_max CHECK (passing_marks <= max_marks)
);
CREATE INDEX IF NOT EXISTS exam_subjects_school_exam_idx
  ON public.exam_subjects (school_id, exam_id);
CREATE INDEX IF NOT EXISTS exam_subjects_school_date_idx
  ON public.exam_subjects (school_id, exam_date);
DROP TRIGGER IF EXISTS exam_subjects_touch ON public.exam_subjects;
CREATE TRIGGER exam_subjects_touch BEFORE UPDATE ON public.exam_subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. exam_schedules (room/invigilator detail) --------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  exam_subject_id UUID NOT NULL
    REFERENCES public.exam_subjects(id) ON DELETE CASCADE,
  room TEXT,
  invigilator_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_subject_id)
);
CREATE INDEX IF NOT EXISTS exam_schedules_school_idx
  ON public.exam_schedules (school_id);
DROP TRIGGER IF EXISTS exam_schedules_touch ON public.exam_schedules;
CREATE TRIGGER exam_schedules_touch BEFORE UPDATE ON public.exam_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Tenant-safe relationships (Phase 3 pattern) ------------------------------------
DROP TRIGGER IF EXISTS exams_tenant_year ON public.exams;
CREATE TRIGGER exams_tenant_year BEFORE INSERT OR UPDATE OF academic_year_id, school_id ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('academic_years', 'academic_year_id');
DROP TRIGGER IF EXISTS exams_tenant_class ON public.exams;
CREATE TRIGGER exams_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS exam_subjects_tenant_exam ON public.exam_subjects;
CREATE TRIGGER exam_subjects_tenant_exam BEFORE INSERT OR UPDATE OF exam_id, school_id ON public.exam_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('exams', 'exam_id');
DROP TRIGGER IF EXISTS exam_subjects_tenant_subject ON public.exam_subjects;
CREATE TRIGGER exam_subjects_tenant_subject BEFORE INSERT OR UPDATE OF subject_id, school_id ON public.exam_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('subjects', 'subject_id');
DROP TRIGGER IF EXISTS exam_schedules_tenant_exam_subject ON public.exam_schedules;
CREATE TRIGGER exam_schedules_tenant_exam_subject BEFORE INSERT OR UPDATE OF exam_subject_id, school_id ON public.exam_schedules
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('exam_subjects', 'exam_subject_id');
DROP TRIGGER IF EXISTS exam_schedules_tenant_invigilator ON public.exam_schedules;
CREATE TRIGGER exam_schedules_tenant_invigilator BEFORE INSERT OR UPDATE OF invigilator_id, school_id ON public.exam_schedules
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('teachers', 'invigilator_id');

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['exams', 'exam_subjects', 'exam_schedules'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_move', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF school_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move()',
      t || '_no_move', t
    );
  END LOOP;
END;
$$;

-- 5. RLS ---------------------------------------------------------------------------
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;

-- exams: admins (own school) full; teachers see exams whose class contains one
-- of their assigned sections; parents see exams of linked children's classes.
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
    )
  );
DROP POLICY IF EXISTS exams_admin_write ON public.exams;
CREATE POLICY exams_admin_write ON public.exams
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- exam_subjects: mirror the exam visibility (defense-in-depth via the exam join).
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
    )
  );
DROP POLICY IF EXISTS exam_subjects_admin_write ON public.exam_subjects;
CREATE POLICY exam_subjects_admin_write ON public.exam_subjects
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- exam_schedules: same visibility via exam_subjects → exams.
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
    )
  );
DROP POLICY IF EXISTS exam_schedules_admin_write ON public.exam_schedules;
CREATE POLICY exam_schedules_admin_write ON public.exam_schedules
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
