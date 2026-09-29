-- SIMPLEIN SCHOOL ERP · Phase 13: student published-marks fix + notices hardening.
-- Forward-only; does not touch 0001–0012.
--
-- ROOT CAUSE (proven by live pgTAP phase12): marks_select's STUDENT branch
-- required `(SELECT es.is_published ...)` over public.exam_subjects, but
-- students hold NO exam_subjects read grant — the subquery always evaluated
-- to NULL, so students saw ZERO marks even when results were published.
--
-- FIX (minimum, tenant-safe): a SECURITY DEFINER helper exposing ONLY the
-- publish flag (no subject rows, no exam data), used in place of the
-- RLS-gated subquery. The surrounding policy is otherwise byte-identical:
--   - school_id = current_school_id() outer predicate: unchanged (tenant
--     isolation intact; cross-school marks stay invisible).
--   - student_id = current_student_id(): unchanged (own rows only; another
--     student's marks stay invisible).
--   - Enrollment/class context is guaranteed by the write-time
--     validate_marks_row() trigger: a marks row can only exist for a student
--     enrolled in the exam's class — the same invariant the parent branch
--     already relies on. No extra read-time join needed.
--   - Admin/teacher/parent branches: UNCHANGED.
--
-- NOTICES HARDENING (consistency-only): notices was the only tenant table
-- without a prevent_school_move trigger (migration 0010 ships touch-only).
-- Authenticated moves were already blocked by the RLS WITH CHECK; this adds
-- the same database-level immutability every other tenant table has. No
-- legitimate flow moves school_id, so behavior is unchanged except the
-- bypass-role path now raises like all sibling tables.

-- 1. Publish-flag helper (single boolean, no row exposure) -------------------
CREATE OR REPLACE FUNCTION public.exam_subject_is_published(es_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT es.is_published FROM public.exam_subjects es WHERE es.id = es_id;
$$;

-- Explicit (existing helpers rely on defaults; this states the intent).
GRANT EXECUTE ON FUNCTION public.exam_subject_is_published(UUID) TO authenticated;

-- 2. marks_select: identical to 0012 except the student branch reads the flag
-- via the helper instead of an RLS-gated subquery -----------------------------
DROP POLICY IF EXISTS marks_select ON public.marks;
CREATE POLICY marks_select ON public.marks
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        student_id = public.current_student_id()
        AND public.exam_subject_is_published(marks.exam_subject_id)
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

-- 3. notices school_id immutability (parity with all other tenant tables) ----
DROP TRIGGER IF EXISTS notices_no_move ON public.notices;
CREATE TRIGGER notices_no_move BEFORE UPDATE OF school_id ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();
