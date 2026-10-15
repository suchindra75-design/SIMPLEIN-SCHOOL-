-- SIMPLEIN SCHOOL ERP · 0021 — per-record storage read scope.
--
-- The SELECT policies on storage.objects for report cards, fee receipts,
-- homework and notice attachments and student photos (0003/0007/0009/0010/0011)
-- only checked the tenant folder (schools/<current_school_id>/…). Any member
-- of a school could therefore list and sign URLs for every file in it: other
-- children's report-card PDFs (including drafts), other families' fee
-- receipts, every student photo, and attachments of notices meant for other
-- classes. The homework write policy also let any teacher overwrite or delete
-- any homework file in the school.
--
-- Fix: a file is readable only when the caller can SELECT the row that
-- references it — evaluated through that table's existing RLS (families see
-- their own published report cards and non-voided receipts, notices of their
-- audience, homework of their sections, their own student record; teachers
-- their scope; admins everything). Past papers and teacher photos stay
-- school-wide by design. Teachers may write homework files only for homework
-- in sections they teach.

-- Lookup indexes for the reference checks.
CREATE INDEX IF NOT EXISTS report_cards_pdf_path_idx ON public.report_cards (pdf_path);
CREATE INDEX IF NOT EXISTS fee_payment_records_receipt_path_idx ON public.fee_payment_records (receipt_path);
CREATE INDEX IF NOT EXISTS notices_attachment_path_idx ON public.notices (attachment_path);
CREATE INDEX IF NOT EXISTS students_photo_path_idx ON public.students (photo_path);

DROP POLICY IF EXISTS report_cards_storage_select ON storage.objects;
CREATE POLICY report_cards_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'report-cards'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      public.is_school_admin()
      OR EXISTS (SELECT 1 FROM public.report_cards rc WHERE rc.pdf_path = objects.name)
    )
  );

DROP POLICY IF EXISTS fee_receipts_select ON storage.objects;
CREATE POLICY fee_receipts_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      public.is_school_admin()
      OR EXISTS (SELECT 1 FROM public.fee_payment_records r WHERE r.receipt_path = objects.name)
    )
  );

DROP POLICY IF EXISTS homework_storage_select ON storage.objects;
CREATE POLICY homework_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'homework-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      public.is_school_admin()
      OR EXISTS (SELECT 1 FROM public.homework_attachments a WHERE a.path = objects.name)
    )
  );

DROP POLICY IF EXISTS notice_storage_select ON storage.objects;
CREATE POLICY notice_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'notice-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      public.is_school_admin()
      OR EXISTS (SELECT 1 FROM public.notices n WHERE n.attachment_path = objects.name)
    )
  );

DROP POLICY IF EXISTS photos_select_same_school ON storage.objects;
CREATE POLICY photos_select_same_school ON storage.objects
  FOR SELECT USING (
    bucket_id = ANY (ARRAY['student-photos', 'teacher-photos'])
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      bucket_id = 'teacher-photos'
      OR public.is_school_admin()
      OR EXISTS (SELECT 1 FROM public.students st WHERE st.photo_path = objects.name)
    )
  );

DROP POLICY IF EXISTS homework_storage_write ON storage.objects;
CREATE POLICY homework_storage_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'homework-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.homework h
          WHERE h.id::text = (storage.foldername(name))[4]
            AND h.section_id IN (SELECT public.teacher_section_ids())
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'homework-attachments'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (
      public.is_school_admin()
      OR (
        public.has_app_role('TEACHER')
        AND EXISTS (
          SELECT 1 FROM public.homework h
          WHERE h.id::text = (storage.foldername(name))[4]
            AND h.section_id IN (SELECT public.teacher_section_ids())
        )
      )
    )
  );
