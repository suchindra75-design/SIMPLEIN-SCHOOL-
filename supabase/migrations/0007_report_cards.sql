-- SIMPLEIN SCHOOL ERP · Phase 7: Report Cards.
-- Extends 0001–0006 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Model (docs/DATABASE.md §19): report_cards is a generated SNAPSHOT per
-- (exam, student) — marks/grades/attendance totals frozen at generation.
-- The LIVE result publish state stays on exam_subjects (Phase 6) and is
-- re-checked in the service; status here is the generation-time snapshot.
-- PDFs live in the private `report-cards` bucket (signed access only).

-- 1. report_cards -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  grading_system_id UUID REFERENCES public.grading_systems(id) ON DELETE SET NULL,
  total_obtained NUMERIC(8,2) NOT NULL DEFAULT 0,
  max_total NUMERIC(8,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2),
  cgpa NUMERIC(4,2),
  overall_grade TEXT,
  attendance_percentage NUMERIC(5,2),
  remarks TEXT,
  pdf_path TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED')),
  published_by UUID REFERENCES public.users(id),
  published_at TIMESTAMPTZ,
  generated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One snapshot per (exam, student); regeneration updates it.
  UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS report_cards_school_exam_idx
  ON public.report_cards (school_id, exam_id);
CREATE INDEX IF NOT EXISTS report_cards_school_student_idx
  ON public.report_cards (school_id, student_id);
DROP TRIGGER IF EXISTS report_cards_touch ON public.report_cards;
CREATE TRIGGER report_cards_touch BEFORE UPDATE ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Tenant triggers (Phase 3 pattern) ------------------------------------------
DROP TRIGGER IF EXISTS report_cards_tenant_exam ON public.report_cards;
CREATE TRIGGER report_cards_tenant_exam BEFORE INSERT OR UPDATE OF exam_id, school_id ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('exams', 'exam_id');
DROP TRIGGER IF EXISTS report_cards_tenant_student ON public.report_cards;
CREATE TRIGGER report_cards_tenant_student BEFORE INSERT OR UPDATE OF student_id, school_id ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('students', 'student_id');
DROP TRIGGER IF EXISTS report_cards_tenant_grading ON public.report_cards;
CREATE TRIGGER report_cards_tenant_grading BEFORE INSERT OR UPDATE OF grading_system_id, school_id ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('grading_systems', 'grading_system_id');
DROP TRIGGER IF EXISTS report_cards_no_move ON public.report_cards;
CREATE TRIGGER report_cards_no_move BEFORE UPDATE OF school_id ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 3. Private storage bucket + policies (tenant-prefixed paths) --------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-cards', 'report-cards', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS report_cards_storage_select ON storage.objects;
CREATE POLICY report_cards_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'report-cards'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
  );
DROP POLICY IF EXISTS report_cards_storage_admin_write ON storage.objects;
CREATE POLICY report_cards_storage_admin_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'report-cards'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  )
  WITH CHECK (
    bucket_id = 'report-cards'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  );

-- 4. RLS ---------------------------------------------------------------------------
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

-- Reads: admins (own school); teachers via the exam's class sections; parents
-- via student_parents AND only PUBLISHED snapshots. Writes: admin-only.
DROP POLICY IF EXISTS report_cards_select ON public.report_cards;
CREATE POLICY report_cards_select ON public.report_cards
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.exams e
          JOIN public.sections s ON s.class_id = e.class_id
          WHERE e.id = report_cards.exam_id
            AND public.teacher_can_access_section(s.id)
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND report_cards.status = 'PUBLISHED'
        AND public.parent_can_access_student(report_cards.student_id)
      )
    )
  );
DROP POLICY IF EXISTS report_cards_admin_write ON public.report_cards;
CREATE POLICY report_cards_admin_write ON public.report_cards
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
