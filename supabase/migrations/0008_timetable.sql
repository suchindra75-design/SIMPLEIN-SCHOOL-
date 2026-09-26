-- SIMPLEIN SCHOOL ERP · Phase 8: Timetable.
-- Extends 0001–0007 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Model (docs/DATABASE.md §20): timetable_slots — one row per
-- section × day × period. Periods/names/times are fully configurable (no
-- hard-coded school period structure). Conflicts prevented at the DB:
-- - Section overlap: UNIQUE(section_id, day_of_week, period_index)
-- - Teacher double-booking: partial UNIQUE(year, teacher, day, period)
--   (teacher_id NULL = non-teaching slot; NULLs never conflict)

-- 1. timetable_slots ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Mon … 7=Sun
  period_index INTEGER NOT NULL CHECK (period_index >= 0),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  room TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One slot per section per day per period: overlap prevented at the DB.
  UNIQUE (section_id, day_of_week, period_index),
  -- Time-range validity enforced at the DB, not just app code.
  CONSTRAINT timetable_slots_valid_range CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS timetable_slots_school_section_idx
  ON public.timetable_slots (school_id, section_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS timetable_slots_school_teacher_idx
  ON public.timetable_slots (school_id, teacher_id, day_of_week);
-- Teacher double-booking: a teacher cannot hold two sections in the same
-- year/day/period (NULL teacher_id slots are exempt — partial index).
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slots_teacher_no_clash_idx
  ON public.timetable_slots (academic_year_id, teacher_id, day_of_week, period_index)
  WHERE teacher_id IS NOT NULL;
DROP TRIGGER IF EXISTS timetable_slots_touch ON public.timetable_slots;
CREATE TRIGGER timetable_slots_touch BEFORE UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Tenant triggers (Phase 3 pattern) ----------------------------------------------
DROP TRIGGER IF EXISTS timetable_slots_tenant_section ON public.timetable_slots;
CREATE TRIGGER timetable_slots_tenant_section BEFORE INSERT OR UPDATE OF section_id, school_id ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');
DROP TRIGGER IF EXISTS timetable_slots_tenant_subject ON public.timetable_slots;
CREATE TRIGGER timetable_slots_tenant_subject BEFORE INSERT OR UPDATE OF subject_id, school_id ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('subjects', 'subject_id');
DROP TRIGGER IF EXISTS timetable_slots_tenant_teacher ON public.timetable_slots;
CREATE TRIGGER timetable_slots_tenant_teacher BEFORE INSERT OR UPDATE OF teacher_id, school_id ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('teachers', 'teacher_id');
DROP TRIGGER IF EXISTS timetable_slots_tenant_year ON public.timetable_slots;
CREATE TRIGGER timetable_slots_tenant_year BEFORE INSERT OR UPDATE OF academic_year_id, school_id ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('academic_years', 'academic_year_id');
DROP TRIGGER IF EXISTS timetable_slots_no_move ON public.timetable_slots;
CREATE TRIGGER timetable_slots_no_move BEFORE UPDATE OF school_id ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 3. RLS ---------------------------------------------------------------------------
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

-- Reads: same school; any active member (parents/teachers consume via the
-- section/teacher views; finer scope is enforced in services). Writes:
-- admin-only.
DROP POLICY IF EXISTS timetable_slots_select ON public.timetable_slots;
CREATE POLICY timetable_slots_select ON public.timetable_slots
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS timetable_slots_admin_write ON public.timetable_slots;
CREATE POLICY timetable_slots_admin_write ON public.timetable_slots
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
