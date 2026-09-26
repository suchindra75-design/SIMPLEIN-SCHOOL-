-- SIMPLEIN SCHOOL ERP · Phase 12: Student Portal + Promotion + PYQs.
-- Extends 0001–0011 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- STUDENT PORTAL ACTIVATION: students.user_id links a login to the student's
-- own data. The STUDENT role (dormant until now) gains self-only reads via
-- current_student_id() across every module's RLS. Self-scope: a student can
-- ONLY ever read their own row/records, own school, published results, and
-- their section/class-scoped timetable/homework/notices.

-- 1. students.user_id (login link) ------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES public.users(id);
DROP TRIGGER IF EXISTS students_tenant_user ON public.students;
CREATE TRIGGER students_tenant_user BEFORE INSERT OR UPDATE OF user_id, school_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('users', 'user_id');

-- 2. current_student_id helper ------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT st.id FROM public.students st
  WHERE st.user_id = public.current_app_user_id() AND st.status = 'active'
  LIMIT 1;
$$;

-- 3. RLS: student self-access extensions (compose with existing policies) ------

-- students: self row.
DROP POLICY IF EXISTS students_select_scoped ON public.students;
CREATE POLICY students_select_scoped ON public.students
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR id = public.current_student_id()
      OR (
        section_id IS NOT NULL
        AND public.teacher_can_access_section(section_id)
        AND public.has_app_role('TEACHER')
      )
      OR public.parent_can_access_student(id)
    )
  );

-- student_enrollments: own history.
DROP POLICY IF EXISTS enrollments_select_scoped ON public.student_enrollments;
CREATE POLICY enrollments_select_scoped ON public.student_enrollments
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR student_id = public.current_student_id()
      OR (
        section_id IS NOT NULL
        AND public.teacher_can_access_section(section_id)
        AND public.has_app_role('TEACHER')
      )
      OR public.parent_can_access_student(student_id)
    )
  );

-- attendance_records: own attendance.
DROP POLICY IF EXISTS attendance_records_select ON public.attendance_records;
CREATE POLICY attendance_records_select ON public.attendance_records
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR student_id = public.current_student_id()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.attendance_sessions s
          WHERE s.id = attendance_records.attendance_session_id
            AND public.teacher_can_access_section(s.section_id)
        )
      )
      OR public.parent_can_access_student(attendance_records.student_id)
    )
  );

-- marks: OWN marks, PUBLISHED only (students never see unpublished results).
DROP POLICY IF EXISTS marks_select ON public.marks;
CREATE POLICY marks_select ON public.marks
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        student_id = public.current_student_id()
        AND (SELECT es.is_published FROM public.exam_subjects es
             WHERE es.id = marks.exam_subject_id)
      )
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

-- report_cards: OWN cards, PUBLISHED only.
DROP POLICY IF EXISTS report_cards_select ON public.report_cards;
CREATE POLICY report_cards_select ON public.report_cards
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        student_id = public.current_student_id()
        AND report_cards.status = 'PUBLISHED'
      )
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

-- student_fees: own fees.
DROP POLICY IF EXISTS student_fees_select ON public.student_fees;
CREATE POLICY student_fees_select ON public.student_fees
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR student_id = public.current_student_id()
      OR public.parent_can_access_student(student_fees.student_id)
    )
  );

-- timetable_slots: own section's timetable (via the student row).
DROP POLICY IF EXISTS timetable_slots_select ON public.timetable_slots;
CREATE POLICY timetable_slots_select ON public.timetable_slots
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        section_id = (SELECT st.section_id FROM public.students st
                      WHERE st.id = public.current_student_id())
      )
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(timetable_slots.section_id)
      )
      OR public.has_app_role('PARENT')
    )
  );

-- homework: own section's homework.
DROP POLICY IF EXISTS homework_select ON public.homework;
CREATE POLICY homework_select ON public.homework
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        section_id = (SELECT st.section_id FROM public.students st
                      WHERE st.id = public.current_student_id())
      )
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

-- notices: audience-aware for students (SECTION → own section; CLASS → own
-- class; untargeted = school-wide; PARENTS/TEACHERS channels excluded).
DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('STUDENT')
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
          )
          OR EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
              AND (
                (
                  nt.audience_type = 'SECTION'
                  AND nt.section_id = (SELECT st.section_id FROM public.students st
                                       WHERE st.id = public.current_student_id())
                )
                OR (
                  nt.audience_type = 'CLASS'
                  AND nt.class_id = (SELECT st.class_id FROM public.students st
                                     WHERE st.id = public.current_student_id())
                )
              )
          )
        )
      )
      OR (
        public.has_app_role('TEACHER')
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
          )
          OR EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
              AND (
                nt.audience_type = 'TEACHERS'
                OR (
                  nt.audience_type = 'SECTION'
                  AND public.teacher_can_access_section(nt.section_id)
                )
                OR (
                  nt.audience_type = 'CLASS'
                  AND EXISTS (
                    SELECT 1 FROM public.sections s
                    JOIN public.teacher_subjects ts ON ts.section_id = s.id
                    WHERE s.class_id = nt.class_id
                      AND ts.teacher_id = public.current_teacher_id()
                  )
                )
              )
          )
          OR notices.created_by = public.current_app_user_id()
        )
      )
      OR (
        public.has_app_role('PARENT')
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
          )
          OR EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
              AND (
                nt.audience_type = 'PARENTS'
                OR (
                  nt.audience_type = 'SECTION'
                  AND EXISTS (
                    SELECT 1 FROM public.student_parents sp
                    JOIN public.students st ON st.id = sp.student_id
                    WHERE sp.parent_id = public.current_parent_id()
                      AND st.section_id = nt.section_id
                  )
                )
                OR (
                  nt.audience_type = 'CLASS'
                  AND EXISTS (
                    SELECT 1 FROM public.student_parents sp
                    JOIN public.students st ON st.id = sp.student_id
                    WHERE sp.parent_id = public.current_parent_id()
                      AND st.class_id = nt.class_id
                  )
                )
              )
          )
        )
      )
    )
  );

-- 4. PYQs (Previous Year Questions — school-managed) -----------------------------
CREATE TABLE IF NOT EXISTS public.pyqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  year_label TEXT NOT NULL CHECK (char_length(year_label) BETWEEN 2 AND 20), -- e.g. "2025"
  exam_board_name TEXT NOT NULL CHECK (char_length(exam_board_name) BETWEEN 1 AND 120), -- e.g. "CBSE Board 2024"
  title TEXT,
  file_bucket TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_bytes INTEGER NOT NULL CHECK (file_bytes > 0),
  solution_bucket TEXT,
  solution_path TEXT,
  solution_name TEXT,
  solution_mime TEXT,
  solution_bytes INTEGER CHECK (solution_bytes IS NULL OR solution_bytes > 0),
  answer_key_path TEXT,
  answer_key_name TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true, -- archive (history kept)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pyqs_school_class_idx
  ON public.pyqs (school_id, class_id, subject_id);
CREATE INDEX IF NOT EXISTS pyqs_school_year_idx
  ON public.pyqs (school_id, year_label);
DROP TRIGGER IF EXISTS pyqs_touch ON public.pyqs;
CREATE TRIGGER pyqs_touch BEFORE UPDATE ON public.pyqs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS pyqs_tenant_class ON public.pyqs;
CREATE TRIGGER pyqs_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.pyqs
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS pyqs_tenant_subject ON public.pyqs;
CREATE TRIGGER pyqs_tenant_subject BEFORE INSERT OR UPDATE OF subject_id, school_id ON public.pyqs
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('subjects', 'subject_id');
DROP TRIGGER IF EXISTS pyqs_no_move ON public.pyqs;
CREATE TRIGGER pyqs_no_move BEFORE UPDATE OF school_id ON public.pyqs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

INSERT INTO storage.buckets (id, name, public)
VALUES ('pyqs', 'pyqs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS pyqs_storage_select ON storage.objects;
CREATE POLICY pyqs_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pyqs'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
  );
DROP POLICY IF EXISTS pyqs_storage_admin_write ON storage.objects;
CREATE POLICY pyqs_storage_admin_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'pyqs'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  )
  WITH CHECK (
    bucket_id = 'pyqs'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  );

-- PYQ reads: same school (students/teachers/parents browse their school's
-- bank); writes admin-only.
DROP POLICY IF EXISTS pyqs_select ON public.pyqs;
CREATE POLICY pyqs_select ON public.pyqs
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS pyqs_admin_write ON public.pyqs;
CREATE POLICY pyqs_admin_write ON public.pyqs
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
