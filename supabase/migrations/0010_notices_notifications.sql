-- SIMPLEIN SCHOOL ERP · Phase 10: Notices + In-App Notifications.
-- Extends 0001–0009 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), teacher_can_access_section(), parent_can_access_student(),
-- assert_child_same_school(), prevent_school_move().
--
-- Targeting model (docs/ARCHITECTURE.md §24): notice_targets rows define the
-- audience (SCHOOL | CLASS | SECTION | TEACHERS | PARENTS). No targets =
-- school-wide. Recipient resolution + audience filtering are enforced in
-- BOTH the service (feeds, 404 boundary) and RLS (audience joins).
-- Attachments: single attachment per notice, private `notice-attachments`
-- bucket, signed access only.

-- 1. notices -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  category TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK (category IN ('GENERAL', 'CLASS', 'SECTION', 'EXAM', 'HOLIDAY', 'URGENT')),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT true, -- soft-delete/archive (history kept)
  attachment_bucket TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_bytes INTEGER CHECK (attachment_bytes IS NULL OR attachment_bytes > 0),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notices_school_published_idx
  ON public.notices (school_id, is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS notices_school_category_idx
  ON public.notices (school_id, category, created_at DESC);
DROP TRIGGER IF EXISTS notices_touch ON public.notices;
CREATE TRIGGER notices_touch BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. notice_targets ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notice_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  notice_id UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL
    CHECK (audience_type IN ('SCHOOL', 'CLASS', 'SECTION', 'TEACHERS', 'PARENTS')),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Audience shape validity enforced at the DB.
  CONSTRAINT notice_targets_school_shape CHECK (
    (audience_type IN ('SCHOOL', 'TEACHERS', 'PARENTS') AND class_id IS NULL AND section_id IS NULL)
    OR (audience_type = 'CLASS' AND class_id IS NOT NULL AND section_id IS NULL)
    OR (audience_type = 'SECTION' AND section_id IS NOT NULL AND class_id IS NULL)
  )
);
-- Duplicate targets prevented at the DB (per audience shape).
CREATE UNIQUE INDEX IF NOT EXISTS notice_targets_unique_idx
  ON public.notice_targets (notice_id, audience_type, class_id, section_id);
CREATE INDEX IF NOT EXISTS notice_targets_notice_idx
  ON public.notice_targets (notice_id);
CREATE INDEX IF NOT EXISTS notice_targets_school_section_idx
  ON public.notice_targets (school_id, section_id);
DROP TRIGGER IF EXISTS notice_targets_tenant_class ON public.notice_targets;
CREATE TRIGGER notice_targets_tenant_class BEFORE INSERT OR UPDATE OF class_id, school_id ON public.notice_targets
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('classes', 'class_id');
DROP TRIGGER IF EXISTS notice_targets_tenant_section ON public.notice_targets;
CREATE TRIGGER notice_targets_tenant_section BEFORE INSERT OR UPDATE OF section_id, school_id ON public.notice_targets
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('sections', 'section_id');
DROP TRIGGER IF EXISTS notice_targets_no_move ON public.notice_targets;
CREATE TRIGGER notice_targets_no_move BEFORE UPDATE OF school_id ON public.notice_targets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- 3. notifications --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- recipient
  type TEXT NOT NULL
    CHECK (type IN ('NOTICE', 'HOMEWORK', 'EXAM', 'RESULT', 'ATTENDANCE', 'ACCOUNT')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  message TEXT NOT NULL DEFAULT '',
  entity TEXT,       -- e.g. 'notices', 'homework'
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Badge query + recipient lookups.
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_school_created_idx
  ON public.notifications (school_id, created_at DESC);

-- 4. Private storage bucket + policies --------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('notice-attachments', 'notice-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS notice_storage_select ON storage.objects;
CREATE POLICY notice_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'notice-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
  );
DROP POLICY IF EXISTS notice_storage_admin_write ON storage.objects;
CREATE POLICY notice_storage_admin_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'notice-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  )
  WITH CHECK (
    bucket_id = 'notice-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  );

-- 5. RLS ---------------------------------------------------------------------------
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Notices: audience filtering in RLS (same joins as the service feeds).
-- Admin: all own-school notices. Teacher: school-wide (untargeted) + TEACHERS
-- + their sections/classes + own drafts. Parent: school-wide + PARENTS +
-- linked children's sections/classes.
DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
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
-- Writes: admins only (teachers have read-only notice permissions in the
-- matrix — deny-by-default; teacher notice creation is a future policy flag).
DROP POLICY IF EXISTS notices_admin_write ON public.notices;
CREATE POLICY notices_admin_write ON public.notices
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- notice_targets: admins manage; members read (feed composition uses them).
DROP POLICY IF EXISTS notice_targets_select ON public.notice_targets;
CREATE POLICY notice_targets_select ON public.notice_targets
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS notice_targets_admin_write ON public.notice_targets;
CREATE POLICY notice_targets_admin_write ON public.notice_targets
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- Notifications: RECIPIENT ISOLATION — a user reads/updates ONLY their own
-- inbox rows (never another user's, even same school). Writes (fan-out) are
-- performed by authorized school roles (admin/teacher) on behalf of events;
-- the service resolves recipients server-side.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = public.current_app_user_id());
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());
DROP POLICY IF EXISTS notifications_fanout_write ON public.notifications;
CREATE POLICY notifications_fanout_write ON public.notifications
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR public.has_app_role('TEACHER'))
  );
