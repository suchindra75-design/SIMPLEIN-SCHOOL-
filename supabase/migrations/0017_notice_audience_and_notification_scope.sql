-- SIMPLEIN SCHOOL ERP · 0017 — notice audience + notification tenant scope.
--
-- 1. notices_select (0012) only treated a notice with NO target rows as
--    school-wide, but the app always writes a target row and uses
--    audience_type = 'SCHOOL' for school-wide notices, so non-admins never saw
--    them. It also did not require is_published / is_active, so a targeted
--    draft or archived notice was readable by its audience through PostgREST.
--    Rewritten: SCHOOL matches every member; non-admins see published, active
--    notices only (teachers also keep their own); CLASS notices reach every
--    teacher with access to a section of that class (class teacher or subject
--    teacher), matching teacher_can_access_section.
-- 2. notifications_fanout_write (0010) checked school_id but not that the
--    recipient belongs to that school, so a member could insert notifications
--    into another school's inbox. The recipient must now be in the caller's
--    school (checked via a narrow SECURITY DEFINER boolean helper because the
--    caller may not be able to read the recipient's users row under RLS).

DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (public.has_app_role('TEACHER') AND notices.created_by = public.current_app_user_id())
      OR (
        notices.is_published
        AND notices.is_active
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.notice_targets nt WHERE nt.notice_id = notices.id
          )
          OR EXISTS (
            SELECT 1 FROM public.notice_targets nt
            WHERE nt.notice_id = notices.id
              AND (
                nt.audience_type = 'SCHOOL'
                OR (
                  public.has_app_role('TEACHER')
                  AND (
                    nt.audience_type = 'TEACHERS'
                    OR (nt.audience_type = 'SECTION' AND public.teacher_can_access_section(nt.section_id))
                    OR (
                      nt.audience_type = 'CLASS'
                      AND EXISTS (
                        SELECT 1 FROM public.sections s
                        WHERE s.class_id = nt.class_id
                          AND public.teacher_can_access_section(s.id)
                      )
                    )
                  )
                )
                OR (
                  public.has_app_role('PARENT')
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
                OR (
                  public.has_app_role('STUDENT')
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
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.user_in_current_school(target_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = target_user AND u.school_id = public.current_school_id()
  );
$$;
REVOKE ALL ON FUNCTION public.user_in_current_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_in_current_school(UUID) TO authenticated;

DROP POLICY IF EXISTS notifications_fanout_write ON public.notifications;
CREATE POLICY notifications_fanout_write ON public.notifications
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR public.has_app_role('TEACHER'))
    AND public.user_in_current_school(user_id)
  );
