-- SIMPLEIN SCHOOL ERP · Phase 6: Marks + Grades.
-- Extends 0001–0005 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Model (see docs/ARCHITECTURE.md §21):
-- - Result states on exam_subjects (added here, deferred from Phase 5):
--   is_locked (marks editable → locked; teacher edits rejected) and
--   is_published (result visible to parents). Publish/unlock = admin-only,
--   audited.
-- - marks: one row per student per exam-subject. UNIQUE dedupes; a trigger
--   enforces marks ≤ max_marks and academic-enrollment validity at the DB.
-- - grading_systems/grading_rules: configurable percentage bands (CGPA-
--   extensible via grade_point). Non-overlapping bands enforced by trigger.

-- 1. Lock + publish states on exam_subjects ---------------------------------
ALTER TABLE public.exam_subjects
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;

-- 2. marks -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  exam_subject_id UUID NOT NULL
    REFERENCES public.exam_subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  marks_obtained NUMERIC(6,2),
  is_absent BOOLEAN NOT NULL DEFAULT false,
  grade TEXT,
  entered_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_subject_id, student_id),
  CHECK (marks_obtained IS NULL OR marks_obtained >= 0),
  CHECK (NOT is_absent OR marks_obtained IS NULL)
);

CREATE INDEX IF NOT EXISTS marks_school_exam_subject_idx
  ON public.marks (school_id, exam_subject_id);
CREATE INDEX IF NOT EXISTS marks_school_student_idx
  ON public.marks (school_id, student_id);
DROP TRIGGER IF EXISTS marks_touch ON public.marks;
CREATE TRIGGER marks_touch BEFORE UPDATE ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Marks validity enforced at the DB: marks ≤ max_marks of the exam subject,
-- and the student must be enrolled in the exam's class for the exam's
-- academic year (enrollment model first, students.class_id pointer fallback).
CREATE OR REPLACE FUNCTION public.validate_marks_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  max_marks NUMERIC;
  exam_class UUID;
  exam_year UUID;
  enrolled BOOLEAN;
BEGIN
  SELECT es.max_marks, e.class_id, e.academic_year_id
    INTO max_marks, exam_class, exam_year
  FROM public.exam_subjects es
  JOIN public.exams e ON e.id = es.exam_id
  WHERE es.id = NEW.exam_subject_id;
  IF max_marks IS NULL THEN
    RAISE EXCEPTION 'marks reference a missing exam subject';
  END IF;
  IF NEW.marks_obtained IS NOT NULL AND NEW.marks_obtained > max_marks THEN
    RAISE EXCEPTION 'marks_obtained % exceeds max_marks %', NEW.marks_obtained, max_marks;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    WHERE se.student_id = NEW.student_id
      AND se.academic_year_id = exam_year
      AND se.class_id = exam_class
      AND se.status = 'enrolled'
  ) OR EXISTS (
    SELECT 1 FROM public.students st
    WHERE st.id = NEW.student_id
      AND st.class_id = exam_class
      AND st.status = 'active'
  ) INTO enrolled;
  IF NOT enrolled THEN
    RAISE EXCEPTION 'student % is not enrolled in the exam class for the academic year', NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marks_validate ON public.marks;
CREATE TRIGGER marks_validate BEFORE INSERT OR UPDATE OF marks_obtained, is_absent, student_id, exam_subject_id ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.validate_marks_row();

-- Tenant triggers (Phase 3 pattern).
DROP TRIGGER IF EXISTS marks_tenant_exam_subject ON public.marks;
CREATE TRIGGER marks_tenant_exam_subject BEFORE INSERT OR UPDATE OF exam_subject_id, school_id ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('exam_subjects', 'exam_subject_id');
DROP TRIGGER IF EXISTS marks_tenant_student ON public.marks;
CREATE TRIGGER marks_tenant_student BEFORE INSERT OR UPDATE OF student_id, school_id ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('students', 'student_id');
DROP TRIGGER IF EXISTS marks_no_move ON public.marks;
CREATE TRIGGER marks_no_move BEFORE UPDATE OF school_id ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 3. grading_systems + grading_rules --------------------------------------------
CREATE TABLE IF NOT EXISTS public.grading_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
-- Exactly one default grading system per school.
CREATE UNIQUE INDEX IF NOT EXISTS grading_systems_one_default_idx
  ON public.grading_systems (school_id) WHERE is_default;
DROP TRIGGER IF EXISTS grading_systems_touch ON public.grading_systems;
CREATE TRIGGER grading_systems_touch BEFORE UPDATE ON public.grading_systems
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.grading_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  grading_system_id UUID NOT NULL
    REFERENCES public.grading_systems(id) ON DELETE CASCADE,
  min_percentage NUMERIC(5,2) NOT NULL CHECK (min_percentage >= 0),
  max_percentage NUMERIC(5,2) NOT NULL CHECK (max_percentage <= 100),
  grade TEXT NOT NULL CHECK (char_length(grade) >= 1),
  grade_point NUMERIC(4,2),
  remark_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grading_system_id, grade)
);
CREATE INDEX IF NOT EXISTS grading_rules_system_idx
  ON public.grading_rules (grading_system_id);

-- Non-overlapping percentage bands enforced at the DB.
CREATE OR REPLACE FUNCTION public.validate_grading_band()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  overlap BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.grading_rules r
    WHERE r.grading_system_id = NEW.grading_system_id
      AND r.id <> NEW.id
      AND NEW.min_percentage <= r.max_percentage
      AND r.max_percentage >= NEW.min_percentage
      AND NEW.min_percentage < r.max_percentage
      AND NEW.max_percentage > r.min_percentage
  ) INTO overlap;
  IF overlap THEN
    RAISE EXCEPTION 'grading band %–% overlaps an existing band', NEW.min_percentage, NEW.max_percentage;
  END IF;
  IF NEW.max_percentage < NEW.min_percentage THEN
    RAISE EXCEPTION 'grading band max must be >= min';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grading_rules_validate ON public.grading_rules;
CREATE TRIGGER grading_rules_validate BEFORE INSERT OR UPDATE OF min_percentage, max_percentage, grading_system_id ON public.grading_rules
  FOR EACH ROW EXECUTE FUNCTION public.validate_grading_band();

-- Tenant triggers.
DROP TRIGGER IF EXISTS grading_rules_tenant_system ON public.grading_rules;
CREATE TRIGGER grading_rules_tenant_system BEFORE INSERT OR UPDATE OF grading_system_id, school_id ON public.grading_rules
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('grading_systems', 'grading_system_id');
DROP TRIGGER IF EXISTS grading_systems_no_move ON public.grading_systems;
CREATE TRIGGER grading_systems_no_move BEFORE UPDATE OF school_id ON public.grading_systems
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();
DROP TRIGGER IF EXISTS grading_rules_no_move ON public.grading_rules;
CREATE TRIGGER grading_rules_no_move BEFORE UPDATE OF school_id ON public.grading_rules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 4. RLS ---------------------------------------------------------------------------
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_rules ENABLE ROW LEVEL SECURITY;

-- Marks: same-school reads; teachers via the exam's class sections (class
-- teacher or subject assignee); parents via student_parents AND only when the
-- owning exam_subject is_published. Writes: admin + teachers of the exam's
-- class; teacher writes rejected at the DB when the subject is locked.
DROP POLICY IF EXISTS marks_select ON public.marks;
CREATE POLICY marks_select ON public.marks
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
          WHERE es.id = marks.exam_subject_id
            AND (
              s.class_teacher_id = public.current_teacher_id()
              OR EXISTS (
                SELECT 1 FROM public.teacher_subjects ts
                WHERE ts.section_id = s.id
                  AND ts.teacher_id = public.current_teacher_id()
              )
            )
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND (SELECT es.is_published FROM public.exam_subjects es
             WHERE es.id = marks.exam_subject_id)
        AND public.parent_can_access_student(marks.student_id)
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
        AND NOT EXISTS (
          SELECT 1 FROM public.exam_subjects es
          WHERE es.id = marks.exam_subject_id AND es.is_locked
        )
        AND EXISTS (
          SELECT 1 FROM public.exam_subjects es
          JOIN public.exams e ON e.id = es.exam_id
          JOIN public.sections s ON s.class_id = e.class_id
          WHERE es.id = marks.exam_subject_id
            AND (
              s.class_teacher_id = public.current_teacher_id()
              OR EXISTS (
                SELECT 1 FROM public.teacher_subjects ts
                WHERE ts.section_id = s.id
                  AND ts.teacher_id = public.current_teacher_id()
              )
            )
        )
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
        AND NOT EXISTS (
          SELECT 1 FROM public.exam_subjects es
          WHERE es.id = marks.exam_subject_id AND es.is_locked
        )
        AND EXISTS (
          SELECT 1 FROM public.exam_subjects es
          JOIN public.exams e ON e.id = es.exam_id
          JOIN public.sections s ON s.class_id = e.class_id
          WHERE es.id = marks.exam_subject_id
            AND (
              s.class_teacher_id = public.current_teacher_id()
              OR EXISTS (
                SELECT 1 FROM public.teacher_subjects ts
                WHERE ts.section_id = s.id
                  AND ts.teacher_id = public.current_teacher_id()
              )
            )
        )
      )
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND NOT EXISTS (
          SELECT 1 FROM public.exam_subjects es
          WHERE es.id = marks.exam_subject_id AND es.is_locked
        )
        AND EXISTS (
          SELECT 1 FROM public.exam_subjects es
          JOIN public.exams e ON e.id = es.exam_id
          JOIN public.sections s ON s.class_id = e.class_id
          WHERE es.id = marks.exam_subject_id
            AND (
              s.class_teacher_id = public.current_teacher_id()
              OR EXISTS (
                SELECT 1 FROM public.teacher_subjects ts
                WHERE ts.section_id = s.id
                  AND ts.teacher_id = public.current_teacher_id()
              )
            )
        )
      )
    )
  );

-- Grading tables: members read; admin writes.
DROP POLICY IF EXISTS grading_systems_select ON public.grading_systems;
CREATE POLICY grading_systems_select ON public.grading_systems
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS grading_systems_admin_write ON public.grading_systems;
CREATE POLICY grading_systems_admin_write ON public.grading_systems
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
DROP POLICY IF EXISTS grading_rules_select ON public.grading_rules;
CREATE POLICY grading_rules_select ON public.grading_rules
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS grading_rules_admin_write ON public.grading_rules;
CREATE POLICY grading_rules_admin_write ON public.grading_rules
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
