-- SIMPLEIN SCHOOL ERP · Phase 3: people + academic structure.
-- Extends 0001/0002 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(), has_app_role().
--
-- Design notes (see docs/ARCHITECTURE.md):
-- - classes/sections are school-level (not year-bound); student_enrollments
--   preserves year history so promotion never destroys prior assignments.
-- - students carry current class_id/section_id/roll_number for fast queries.
-- - teacher_subjects.academic_year_id NULL means "current year".
-- - Link scoping (teacher sections, parent children) is enforced BOTH in RLS
--   (cross-link reads denied at the DB) AND in API services (404 boundary).

-- 1. Academic years ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  name TEXT NOT NULL CHECK (char_length(name) >= 2),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL CHECK (ends_on > starts_on),
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
-- Exactly one current year per school (enforced at the DB, not in app code).
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_current_idx
  ON public.academic_years (school_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS academic_years_school_idx
  ON public.academic_years (school_id);
DROP TRIGGER IF EXISTS academic_years_touch ON public.academic_years;
CREATE TRIGGER academic_years_touch BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Teachers ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  user_id UUID UNIQUE REFERENCES public.users(id),
  employee_no TEXT NOT NULL,
  first_name TEXT NOT NULL CHECK (char_length(first_name) >= 1),
  last_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  qualification TEXT,
  date_of_joining DATE,
  photo_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, employee_no)
);
CREATE INDEX IF NOT EXISTS teachers_school_active_idx
  ON public.teachers (school_id, is_active);
DROP TRIGGER IF EXISTS teachers_touch ON public.teachers;
CREATE TRIGGER teachers_touch BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Parents -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  user_id UUID UNIQUE REFERENCES public.users(id),
  full_name TEXT NOT NULL CHECK (char_length(full_name) >= 2),
  phone TEXT,
  email TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parents_school_active_idx
  ON public.parents (school_id, is_active);
CREATE INDEX IF NOT EXISTS parents_school_phone_idx
  ON public.parents (school_id, phone);
DROP TRIGGER IF EXISTS parents_touch ON public.parents;
CREATE TRIGGER parents_touch BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Classes -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS classes_school_order_idx
  ON public.classes (school_id, order_index);
DROP TRIGGER IF EXISTS classes_touch ON public.classes;
CREATE TRIGGER classes_touch BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Sections ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  order_index INTEGER NOT NULL DEFAULT 0,
  class_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  room TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
CREATE INDEX IF NOT EXISTS sections_school_class_idx
  ON public.sections (school_id, class_id);
DROP TRIGGER IF EXISTS sections_touch ON public.sections;
CREATE TRIGGER sections_touch BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Subjects ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  code TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_school_code_idx
  ON public.subjects (school_id, code) WHERE code IS NOT NULL;
DROP TRIGGER IF EXISTS subjects_touch ON public.subjects;
CREATE TRIGGER subjects_touch BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Students ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  admission_no TEXT NOT NULL CHECK (char_length(admission_no) >= 1),
  first_name TEXT NOT NULL CHECK (char_length(first_name) >= 1),
  middle_name TEXT,
  last_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  dob DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  photo_path TEXT,
  address TEXT,
  guardian_phone TEXT,
  admission_date DATE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  roll_number TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'graduated', 'transferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, admission_no)
);
CREATE INDEX IF NOT EXISTS students_school_section_idx
  ON public.students (school_id, class_id, section_id);
CREATE INDEX IF NOT EXISTS students_school_status_idx
  ON public.students (school_id, status);
CREATE INDEX IF NOT EXISTS students_school_name_idx
  ON public.students (school_id, last_name, first_name);
CREATE UNIQUE INDEX IF NOT EXISTS students_section_roll_idx
  ON public.students (school_id, class_id, section_id, roll_number)
  WHERE roll_number IS NOT NULL AND section_id IS NOT NULL;
DROP TRIGGER IF EXISTS students_touch ON public.students;
CREATE TRIGGER students_touch BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. Parent ↔ student links (many-to-many both directions) -------------------
CREATE TABLE IF NOT EXISTS public.student_parents (
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'guardian'
    CHECK (relation IN ('father', 'mother', 'guardian', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, parent_id)
);
CREATE INDEX IF NOT EXISTS student_parents_parent_idx
  ON public.student_parents (parent_id, student_id);

-- 9. Class ↔ subject catalogue ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id)
);
CREATE INDEX IF NOT EXISTS class_subjects_school_idx
  ON public.class_subjects (school_id, class_id);

-- 10. Teacher assignments (link-scoped authorization source) ------------------
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, subject_id, section_id)
);
CREATE INDEX IF NOT EXISTS teacher_subjects_school_section_idx
  ON public.teacher_subjects (school_id, section_id);

-- 11. Enrollment history (promotion-safe; current pointers stay on students) --
CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  roll_number TEXT,
  status TEXT NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'completed', 'transferred', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id)
);
CREATE INDEX IF NOT EXISTS student_enrollments_school_year_idx
  ON public.student_enrollments (school_id, academic_year_id);

-- 12. Audit log (append-only: no UPDATE/DELETE policies, ever) ----------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  actor_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_logs_school_entity_idx
  ON public.audit_logs (school_id, entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_school_actor_idx
  ON public.audit_logs (school_id, actor_id, created_at DESC);

-- 13. Tenant-consistency triggers ----------------------------------------------
-- Foreign keys alone cannot stop cross-school references (e.g. a section
-- pointing at another school's class). These triggers make every school-owned
-- relationship tenant-consistent at the database layer.

CREATE OR REPLACE FUNCTION public.assert_child_same_school()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_table TEXT := TG_ARGV[0];
  fk_column TEXT := TG_ARGV[1];
  fk_value UUID;
  parent_school UUID;
BEGIN
  EXECUTE format('SELECT ($1).%I', fk_column) INTO fk_value USING NEW;
  IF fk_value IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT school_id FROM %I WHERE id = $1', parent_table)
    INTO parent_school USING fk_value;
  IF parent_school IS NULL THEN
    RAISE EXCEPTION 'referenced % row % does not exist', parent_table, fk_value;
  END IF;
  IF parent_school <> NEW.school_id THEN
    RAISE EXCEPTION 'cross-tenant reference: % % is not in this school',
      parent_table, fk_value;
  END IF;
  RETURN NEW;
END;
$$;

-- For link tables WITHOUT their own school_id (student_parents): both ends
-- must already live in the same school.
CREATE OR REPLACE FUNCTION public.assert_link_same_school()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  table_a TEXT := TG_ARGV[0];
  fk_a TEXT := TG_ARGV[1];
  table_b TEXT := TG_ARGV[2];
  fk_b TEXT := TG_ARGV[3];
  id_a UUID;
  id_b UUID;
  school_a UUID;
  school_b UUID;
BEGIN
  EXECUTE format('SELECT ($1).%I', fk_a) INTO id_a USING NEW;
  EXECUTE format('SELECT ($1).%I', fk_b) INTO id_b USING NEW;
  EXECUTE format('SELECT school_id FROM %I WHERE id = $1', table_a)
    INTO school_a USING id_a;
  EXECUTE format('SELECT school_id FROM %I WHERE id = $1', table_b)
    INTO school_b USING id_b;
  IF school_a IS NULL OR school_b IS NULL THEN
    RAISE EXCEPTION 'link references a missing row';
  END IF;
  IF school_a <> school_b THEN
    RAISE EXCEPTION 'cross-tenant link between % and % is forbidden', table_a, table_b;
  END IF;
  RETURN NEW;
END;
$$;

-- sections → classes, sections.class_teacher → teachers
DROP TRIGGER IF EXISTS sections_tenant_class ON public.sections;
CREATE TRIGGER sections_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS sections_tenant_teacher ON public.sections;
CREATE TRIGGER sections_tenant_teacher BEFORE INSERT OR UPDATE OF class_teacher_id, school_id ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('teachers', 'class_teacher_id');

-- teachers.user_id / parents.user_id → users
DROP TRIGGER IF EXISTS teachers_tenant_user ON public.teachers;
CREATE TRIGGER teachers_tenant_user BEFORE INSERT OR UPDATE OF user_id, school_id ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('users', 'user_id');
DROP TRIGGER IF EXISTS parents_tenant_user ON public.parents;
CREATE TRIGGER parents_tenant_user BEFORE INSERT OR UPDATE OF user_id, school_id ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('users', 'user_id');

-- students → classes / sections
DROP TRIGGER IF EXISTS students_tenant_class ON public.students;
CREATE TRIGGER students_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS students_tenant_section ON public.students;
CREATE TRIGGER students_tenant_section BEFORE INSERT OR UPDATE OF section_id, school_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');

-- student_parents: student and parent must share a school
DROP TRIGGER IF EXISTS student_parents_tenant ON public.student_parents;
CREATE TRIGGER student_parents_tenant BEFORE INSERT OR UPDATE OF student_id, parent_id ON public.student_parents
  FOR EACH ROW EXECUTE FUNCTION public.assert_link_same_school('students', 'student_id', 'parents', 'parent_id');

-- class_subjects → classes / subjects
DROP TRIGGER IF EXISTS class_subjects_tenant_class ON public.class_subjects;
CREATE TRIGGER class_subjects_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS class_subjects_tenant_subject ON public.class_subjects;
CREATE TRIGGER class_subjects_tenant_subject BEFORE INSERT OR UPDATE OF subject_id, school_id ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('subjects', 'subject_id');

-- teacher_subjects → teachers / subjects / sections / academic_years
DROP TRIGGER IF EXISTS teacher_subjects_tenant_teacher ON public.teacher_subjects;
CREATE TRIGGER teacher_subjects_tenant_teacher BEFORE INSERT OR UPDATE OF teacher_id, school_id ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('teachers', 'teacher_id');
DROP TRIGGER IF EXISTS teacher_subjects_tenant_subject ON public.teacher_subjects;
CREATE TRIGGER teacher_subjects_tenant_subject BEFORE INSERT OR UPDATE OF subject_id, school_id ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('subjects', 'subject_id');
DROP TRIGGER IF EXISTS teacher_subjects_tenant_section ON public.teacher_subjects;
CREATE TRIGGER teacher_subjects_tenant_section BEFORE INSERT OR UPDATE OF section_id, school_id ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');
DROP TRIGGER IF EXISTS teacher_subjects_tenant_year ON public.teacher_subjects;
CREATE TRIGGER teacher_subjects_tenant_year BEFORE INSERT OR UPDATE OF academic_year_id, school_id ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('academic_years', 'academic_year_id');

-- student_enrollments → students / years / classes / sections
DROP TRIGGER IF EXISTS enrollments_tenant_student ON public.student_enrollments;
CREATE TRIGGER enrollments_tenant_student BEFORE INSERT OR UPDATE OF student_id, school_id ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('students', 'student_id');
DROP TRIGGER IF EXISTS enrollments_tenant_year ON public.student_enrollments;
CREATE TRIGGER enrollments_tenant_year BEFORE INSERT OR UPDATE OF academic_year_id, school_id ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('academic_years', 'academic_year_id');
DROP TRIGGER IF EXISTS enrollments_tenant_class ON public.student_enrollments;
CREATE TRIGGER enrollments_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS enrollments_tenant_section ON public.student_enrollments;
CREATE TRIGGER enrollments_tenant_section BEFORE INSERT OR UPDATE OF section_id, school_id ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');

-- school_id itself is immutable on tenant tables (a row can never be moved
-- across schools by UPDATE).
CREATE OR REPLACE FUNCTION public.prevent_school_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'school_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_years', 'teachers', 'parents', 'classes', 'sections',
    'subjects', 'students', 'class_subjects', 'teacher_subjects',
    'student_enrollments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_move', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF school_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move()',
      t || '_no_move', t
    );
  END LOOP;
END;
$$;

-- 14. Link-scope helpers (RLS + services share these semantics) ----------------
CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT t.id FROM public.teachers t
  WHERE t.user_id = public.current_app_user_id() AND t.is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_parent_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT p.id FROM public.parents p
  WHERE p.user_id = public.current_app_user_id() AND p.is_active
  LIMIT 1;
$$;

-- Teacher may access a section iff admin, class teacher, or subject assignee.
CREATE OR REPLACE FUNCTION public.teacher_can_access_section(sec UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.is_school_admin()
    OR EXISTS (SELECT 1 FROM public.sections s
               WHERE s.id = sec AND s.class_teacher_id = public.current_teacher_id())
    OR EXISTS (SELECT 1 FROM public.teacher_subjects ts
               WHERE ts.section_id = sec AND ts.teacher_id = public.current_teacher_id());
$$;

-- Parent may access a student iff admin or linked via student_parents.
CREATE OR REPLACE FUNCTION public.parent_can_access_student(stu UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.is_school_admin()
    OR EXISTS (SELECT 1 FROM public.student_parents sp
               WHERE sp.student_id = stu AND sp.parent_id = public.current_parent_id());
$$;

-- 15. RLS -----------------------------------------------------------------------
-- Baseline: same-school reads for catalog tables; link-scoped reads for
-- students; writes are SCHOOL_ADMIN-only (teachers/parents get write
-- policies with their own future modules, e.g. attendance marks entry).

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Catalog tables: any active member of the school reads; admin writes.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_years', 'classes', 'sections', 'subjects',
    'class_subjects', 'teacher_subjects'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_same_school', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (school_id = public.current_school_id())',
      t || '_select_same_school', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (school_id = public.current_school_id() AND public.is_school_admin()) WITH CHECK (school_id = public.current_school_id() AND public.is_school_admin())',
      t || '_admin_write', t
    );
  END LOOP;
END;
$$;

-- Teachers directory: self + school admins + school teachers + parents whose
-- linked child is taught by this teacher (class teacher or subject assignee).
DROP POLICY IF EXISTS teachers_select ON public.teachers;
CREATE POLICY teachers_select ON public.teachers
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      user_id = public.current_app_user_id()
      OR public.is_school_admin()
      OR public.has_app_role('TEACHER')
      OR EXISTS (
        SELECT 1 FROM public.sections s
        JOIN public.students st ON st.section_id = s.id
        JOIN public.student_parents sp ON sp.student_id = st.id
        WHERE sp.parent_id = public.current_parent_id()
          AND (
            s.class_teacher_id = teachers.id
            OR EXISTS (
              SELECT 1 FROM public.teacher_subjects ts
              WHERE ts.section_id = s.id AND ts.teacher_id = teachers.id
            )
          )
      )
    )
  );
DROP POLICY IF EXISTS teachers_admin_write ON public.teachers;
CREATE POLICY teachers_admin_write ON public.teachers
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- Parents directory: self + school admins + school teachers (class-teacher
-- contact is a legitimate need; link-scoped restriction lands with messaging).
DROP POLICY IF EXISTS parents_select ON public.parents;
CREATE POLICY parents_select ON public.parents
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      user_id = public.current_app_user_id()
      OR public.is_school_admin()
      OR public.has_app_role('TEACHER')
    )
  );
DROP POLICY IF EXISTS parents_admin_write ON public.parents;
CREATE POLICY parents_admin_write ON public.parents
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- Students: LINK-SCOPED reads. Admins see all; teachers only assigned
-- sections; parents only linked children. Unenrolled (section NULL) students
-- are admin-visible only. Writes are admin-only.
DROP POLICY IF EXISTS students_select_scoped ON public.students;
CREATE POLICY students_select_scoped ON public.students
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        section_id IS NOT NULL
        AND public.teacher_can_access_section(section_id)
        AND public.has_app_role('TEACHER')
      )
      OR public.parent_can_access_student(id)
    )
  );
DROP POLICY IF EXISTS students_admin_write ON public.students;
CREATE POLICY students_admin_write ON public.students
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- student_parents: admin full; a parent sees their own links; a teacher sees
-- links of students in assigned sections.
DROP POLICY IF EXISTS student_parents_select ON public.student_parents;
CREATE POLICY student_parents_select ON public.student_parents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.students st
            WHERE st.id = student_parents.student_id
              AND st.school_id = public.current_school_id())
    AND (
      public.is_school_admin()
      OR parent_id = public.current_parent_id()
      OR EXISTS (SELECT 1 FROM public.students st
                 WHERE st.id = student_parents.student_id
                   AND st.section_id IS NOT NULL
                   AND public.teacher_can_access_section(st.section_id)
                   AND public.has_app_role('TEACHER'))
    )
  );
DROP POLICY IF EXISTS student_parents_admin_write ON public.student_parents;
CREATE POLICY student_parents_admin_write ON public.student_parents
  FOR ALL USING (
    public.is_school_admin()
    AND EXISTS (SELECT 1 FROM public.students st
                WHERE st.id = student_parents.student_id
                  AND st.school_id = public.current_school_id())
  )
  WITH CHECK (
    public.is_school_admin()
    AND EXISTS (SELECT 1 FROM public.students st
                WHERE st.id = student_parents.student_id
                  AND st.school_id = public.current_school_id())
  );

-- Enrollments follow the same scope as students.
DROP POLICY IF EXISTS enrollments_select_scoped ON public.student_enrollments;
CREATE POLICY enrollments_select_scoped ON public.student_enrollments
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        section_id IS NOT NULL
        AND public.teacher_can_access_section(section_id)
        AND public.has_app_role('TEACHER')
      )
      OR public.parent_can_access_student(student_id)
    )
  );
DROP POLICY IF EXISTS enrollments_admin_write ON public.student_enrollments;
CREATE POLICY enrollments_admin_write ON public.student_enrollments
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- Audit logs: admins read; any active member may append rows about their own
-- school with themselves as actor. NEVER updatable/deletable via RLS.
DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs
  FOR SELECT USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
DROP POLICY IF EXISTS audit_logs_append ON public.audit_logs;
CREATE POLICY audit_logs_append ON public.audit_logs
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND actor_id = public.current_app_user_id()
  );

-- 16. Private photo buckets (tenant-prefixed paths, signed access only) ---------
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', false),
       ('teacher-photos', 'teacher-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Read: member of the school that owns the path prefix schools/{school_id}/…
DROP POLICY IF EXISTS photos_select_same_school ON storage.objects;
CREATE POLICY photos_select_same_school ON storage.objects
  FOR SELECT USING (
    bucket_id IN ('student-photos', 'teacher-photos')
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
  );
-- Write: school admins only (uploads go through admin API/actions).
DROP POLICY IF EXISTS photos_admin_write ON storage.objects;
CREATE POLICY photos_admin_write ON storage.objects
  FOR ALL USING (
    bucket_id IN ('student-photos', 'teacher-photos')
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  )
  WITH CHECK (
    bucket_id IN ('student-photos', 'teacher-photos')
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  );
