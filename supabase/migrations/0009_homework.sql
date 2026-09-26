-- SIMPLEIN SCHOOL ERP · Phase 9: Homework + Assignments.
-- Extends 0001–0008 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Model (docs/DATABASE.md): homework per section+subject+creator with due
-- dates; homework_attachments hold their own storage metadata (the full
-- documents registry lands later). Attachments live in the private
-- `homework-attachments` bucket — signed access only, never public URLs.
-- Soft-delete (is_active) keeps history; hard deletes never cascade into
-- audit trails.

-- 1. homework ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id), -- creator/author
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
  assigned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, -- soft-delete (history preserved)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (due_date >= assigned_on)
);
CREATE INDEX IF NOT EXISTS homework_school_section_due_idx
  ON public.homework (school_id, section_id, due_date DESC);
CREATE INDEX IF NOT EXISTS homework_school_teacher_idx
  ON public.homework (school_id, teacher_id);
DROP TRIGGER IF EXISTS homework_touch ON public.homework;
CREATE TRIGGER homework_touch BEFORE UPDATE ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. homework_attachments -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homework_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  homework_id UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL, -- tenant-prefixed per docs/ARCHITECTURE.md §9
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  uploaded_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);
CREATE INDEX IF NOT EXISTS homework_attachments_homework_idx
  ON public.homework_attachments (homework_id);
CREATE INDEX IF NOT EXISTS homework_attachments_school_idx
  ON public.homework_attachments (school_id);
DROP TRIGGER IF EXISTS homework_attachments_touch ON public.homework_attachments;
CREATE TRIGGER homework_attachments_touch BEFORE UPDATE ON public.homework_attachments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Tenant triggers (Phase 3 pattern) ----------------------------------------------
DROP TRIGGER IF EXISTS homework_tenant_section ON public.homework;
CREATE TRIGGER homework_tenant_section BEFORE INSERT OR UPDATE OF section_id, school_id ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');
DROP TRIGGER IF EXISTS homework_tenant_subject ON public.homework;
CREATE TRIGGER homework_tenant_subject BEFORE INSERT OR UPDATE OF subject_id, school_id ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('subjects', 'subject_id');
DROP TRIGGER IF EXISTS homework_tenant_teacher ON public.homework;
CREATE TRIGGER homework_tenant_teacher BEFORE INSERT OR UPDATE OF teacher_id, school_id ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('teachers', 'teacher_id');
DROP TRIGGER IF EXISTS homework_tenant_year ON public.homework;
CREATE TRIGGER homework_tenant_year BEFORE INSERT OR UPDATE OF academic_year_id, school_id ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('academic_years', 'academic_year_id');
DROP TRIGGER IF EXISTS homework_attachments_tenant ON public.homework_attachments;
CREATE TRIGGER homework_attachments_tenant BEFORE INSERT OR UPDATE OF homework_id, school_id ON public.homework_attachments
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('homework', 'homework_id');
DROP TRIGGER IF EXISTS homework_no_move ON public.homework;
CREATE TRIGGER homework_no_move BEFORE UPDATE OF school_id ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();
DROP TRIGGER IF EXISTS homework_attachments_no_move ON public.homework_attachments;
CREATE TRIGGER homework_attachments_no_move BEFORE UPDATE OF school_id ON public.homework_attachments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 4. Private storage bucket + policies -----------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('homework-attachments', 'homework-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Read: any active member of the owning school (parents download attachments
-- for their children's homework via the service authorization + signed URLs).
DROP POLICY IF EXISTS homework_storage_select ON storage.objects;
CREATE POLICY homework_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'homework-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
  );
-- Write: school admins + teachers (creators upload through the app).
DROP POLICY IF EXISTS homework_storage_write ON storage.objects;
CREATE POLICY homework_storage_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'homework-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (public.is_school_admin() OR public.has_app_role('TEACHER'))
  )
  WITH CHECK (
    bucket_id = 'homework-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (public.is_school_admin() OR public.has_app_role('TEACHER'))
  );

-- 5. RLS ---------------------------------------------------------------------------
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_attachments ENABLE ROW LEVEL SECURITY;

-- Homework reads: admins (own school); teachers via assigned sections; parents
-- via linked children's sections. Writes: admins + teachers of assigned
-- sections (subject-level check is service-enforced).
DROP POLICY IF EXISTS homework_select ON public.homework;
CREATE POLICY homework_select ON public.homework
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(homework.section_id)
      )
      OR (
        public.has_app_role('PARENT')
        AND EXISTS (
          SELECT 1 FROM public.student_parents sp
          JOIN public.students st ON st.id = sp.student_id
          WHERE sp.parent_id = public.current_parent_id()
            AND st.section_id = homework.section_id
        )
      )
    )
  );
DROP POLICY IF EXISTS homework_write ON public.homework;
CREATE POLICY homework_write ON public.homework
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(homework.section_id)
      )
    )
  );
DROP POLICY IF EXISTS homework_update ON public.homework;
CREATE POLICY homework_update ON public.homework
  FOR UPDATE USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(homework.section_id)
      )
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(homework.section_id)
      )
    )
  );

-- Attachments mirror homework visibility (via the homework join).
DROP POLICY IF EXISTS homework_attachments_select ON public.homework_attachments;
CREATE POLICY homework_attachments_select ON public.homework_attachments
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.homework h
          WHERE h.id = homework_attachments.homework_id
            AND public.teacher_can_access_section(h.section_id)
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND EXISTS (
          SELECT 1 FROM public.homework h
          JOIN public.students st ON st.section_id = h.section_id
          JOIN public.student_parents sp ON sp.student_id = st.id
          WHERE h.id = homework_attachments.homework_id
            AND sp.parent_id = public.current_parent_id()
        )
      )
    )
  );
DROP POLICY IF EXISTS homework_attachments_write ON public.homework_attachments;
CREATE POLICY homework_attachments_write ON public.homework_attachments
  FOR ALL USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.homework h
          WHERE h.id = homework_attachments.homework_id
            AND public.teacher_can_access_section(h.section_id)
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
        AND EXISTS (
          SELECT 1 FROM public.homework h
          WHERE h.id = homework_attachments.homework_id
            AND public.teacher_can_access_section(h.section_id)
        )
      )
    )
  );
