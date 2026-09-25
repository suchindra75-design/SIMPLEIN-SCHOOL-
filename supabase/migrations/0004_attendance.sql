-- SIMPLEIN SCHOOL ERP · Phase 4: Attendance.
-- Extends 0001–0003 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Model: attendance_sessions (one per section per date) + attendance_records
-- (one per student per session). Dates are SCHOOL-LOCAL calendar dates (the
-- school's timezone column decides "today"; the server never derives the date
-- from its own local timezone). Percentage rule (one consistent rule, see
-- docs/ARCHITECTURE.md §19): PRESENT counts fully, ABSENT counts against,
-- LEAVE is excused (excluded from the denominator);
-- percentage = present / (present + absent).

-- 1. Status enum (strongly typed; DB-enforced) ------------------------------
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_session_status AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. attendance_sessions ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status public.attendance_session_status NOT NULL DEFAULT 'SUBMITTED',
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One session per section per school-day: duplicate prevention at the DB.
  UNIQUE (section_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_sessions_school_date_idx
  ON public.attendance_sessions (school_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_sessions_school_section_date_idx
  ON public.attendance_sessions (school_id, section_id, attendance_date DESC);
DROP TRIGGER IF EXISTS attendance_sessions_touch ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_touch BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. attendance_records ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  attendance_session_id UUID NOT NULL
    REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  status public.attendance_status NOT NULL,
  remark TEXT,
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attendance_session_id, student_id)
);
CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON public.attendance_records (attendance_session_id);
CREATE INDEX IF NOT EXISTS attendance_records_school_student_idx
  ON public.attendance_records (school_id, student_id, attendance_session_id);
DROP TRIGGER IF EXISTS attendance_records_touch ON public.attendance_records;
CREATE TRIGGER attendance_records_touch BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Tenant-safe relationships (Phase 3 pattern) --------------------------------
-- Session → section / academic_year must be same-school.
DROP TRIGGER IF EXISTS attendance_sessions_tenant_section ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_tenant_section
  BEFORE INSERT OR UPDATE OF section_id, school_id ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');
DROP TRIGGER IF EXISTS attendance_sessions_tenant_year ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_tenant_year
  BEFORE INSERT OR UPDATE OF academic_year_id, school_id ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('academic_years', 'academic_year_id');
-- Record → student must be same-school (a session can never hold another
-- school's students; sessions themselves are same-school via the section FK).
DROP TRIGGER IF EXISTS attendance_records_tenant_student ON public.attendance_records;
CREATE TRIGGER attendance_records_tenant_student
  BEFORE INSERT OR UPDATE OF student_id, school_id ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('students', 'student_id');
-- school_id immutable on both tables.
DROP TRIGGER IF EXISTS attendance_sessions_no_move ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_no_move BEFORE UPDATE OF school_id ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();
DROP TRIGGER IF EXISTS attendance_records_no_move ON public.attendance_records;
CREATE TRIGGER attendance_records_no_move BEFORE UPDATE OF school_id ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 5. RLS ---------------------------------------------------------------------------
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Sessions: same-school reads; teachers additionally scoped to their assigned
-- sections; parents do not consume sessions directly (they read records).
DROP POLICY IF EXISTS attendance_sessions_select ON public.attendance_sessions;
CREATE POLICY attendance_sessions_select ON public.attendance_sessions
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(attendance_sessions.section_id)
      )
    )
  );
-- Writes: admins (own school) + teachers (assigned sections only).
DROP POLICY IF EXISTS attendance_sessions_write ON public.attendance_sessions;
CREATE POLICY attendance_sessions_write ON public.attendance_sessions
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(attendance_sessions.section_id)
      )
    )
  );
DROP POLICY IF EXISTS attendance_sessions_update ON public.attendance_sessions;
CREATE POLICY attendance_sessions_update ON public.attendance_sessions
  FOR UPDATE USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(attendance_sessions.section_id)
      )
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND public.teacher_can_access_section(attendance_sessions.section_id)
      )
    )
  );

-- Records: same-school reads; teachers scoped via their sections; parents via
-- student_parents (linked children only). Writes mirror session writes;
-- parents are read-only; STUDENT role has no policies (dormant).
DROP POLICY IF EXISTS attendance_records_select ON public.attendance_records;
CREATE POLICY attendance_records_select ON public.attendance_records
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
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
DROP POLICY IF EXISTS attendance_records_write ON public.attendance_records;
CREATE POLICY attendance_records_write ON public.attendance_records
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.attendance_sessions s
          WHERE s.id = attendance_records.attendance_session_id
            AND public.teacher_can_access_section(s.section_id)
        )
      )
    )
  );
DROP POLICY IF EXISTS attendance_records_update ON public.attendance_records;
CREATE POLICY attendance_records_update ON public.attendance_records
  FOR UPDATE USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.attendance_sessions s
          WHERE s.id = attendance_records.attendance_session_id
            AND public.teacher_can_access_section(s.section_id)
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
          SELECT 1 FROM public.attendance_sessions s
          WHERE s.id = attendance_records.attendance_session_id
            AND public.teacher_can_access_section(s.section_id)
        )
      )
    )
  );
