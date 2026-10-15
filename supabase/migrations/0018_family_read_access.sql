-- SIMPLEIN SCHOOL ERP · 0018 — family read access the portals rely on.
--
-- Read-only additions (no writes, no data changes). Each mirrors an existing
-- parent rule or the student's own scope:
-- 1. attendance_sessions had no PARENT/STUDENT read, so family attendance
--    history showed no dates (the date lives on the session). A family member
--    may read a session when their child/self has a record in it. Checked via a
--    SECURITY DEFINER helper because attendance_records' own policy reads
--    attendance_sessions (a direct EXISTS would recurse).
-- 2. fee_payment_records had a parent branch but no student branch, so the
--    student fee page showed nothing paid. Students read their own non-voided
--    records (same rule as parents).
-- 3. teachers had a parent branch but no student branch, so teacher names were
--    blank in student timetable/homework. Students read the teachers of their
--    own section (class teacher, subject teacher or timetabled teacher).
-- 4. homework_attachments had a parent branch but no student branch.

CREATE OR REPLACE FUNCTION public.family_can_read_attendance_session(sess UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.attendance_session_id = sess
      AND (
        ar.student_id = public.current_student_id()
        OR EXISTS (
          SELECT 1 FROM public.student_parents sp
          WHERE sp.student_id = ar.student_id
            AND sp.parent_id = public.current_parent_id()
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.family_can_read_attendance_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.family_can_read_attendance_session(UUID) TO authenticated;

DROP POLICY IF EXISTS attendance_sessions_family_select ON public.attendance_sessions;
CREATE POLICY attendance_sessions_family_select ON public.attendance_sessions
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND public.family_can_read_attendance_session(id)
  );

DROP POLICY IF EXISTS fee_payment_records_student_select ON public.fee_payment_records;
CREATE POLICY fee_payment_records_student_select ON public.fee_payment_records
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND NOT is_voided
    AND (
      SELECT sf.student_id FROM public.student_fees sf
      WHERE sf.id = fee_payment_records.student_fee_id
    ) = public.current_student_id()
  );

DROP POLICY IF EXISTS teachers_student_select ON public.teachers;
CREATE POLICY teachers_student_select ON public.teachers
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students st
      JOIN public.sections s ON s.id = st.section_id
      WHERE st.id = public.current_student_id()
        AND (
          s.class_teacher_id = teachers.id
          OR EXISTS (
            SELECT 1 FROM public.teacher_subjects ts
            WHERE ts.section_id = s.id AND ts.teacher_id = teachers.id
          )
          OR EXISTS (
            SELECT 1 FROM public.timetable_slots tt
            WHERE tt.section_id = s.id AND tt.teacher_id = teachers.id
          )
        )
    )
  );

DROP POLICY IF EXISTS homework_attachments_student_select ON public.homework_attachments;
CREATE POLICY homework_attachments_student_select ON public.homework_attachments
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.homework h
      JOIN public.students st ON st.section_id = h.section_id
      WHERE h.id = homework_attachments.homework_id
        AND st.id = public.current_student_id()
    )
  );
