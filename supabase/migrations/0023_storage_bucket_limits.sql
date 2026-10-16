-- SIMPLEIN SCHOOL ERP · Bucket-level upload limits and allowed file types.
-- Forward-only; re-runnable (plain UPDATEs of the 7 existing private buckets).
--
-- WHY: no bucket set file_size_limit or allowed_mime_types, so the limits in
-- lib/services/storage.ts applied only to uploads that go through the app. A
-- user with a valid session calling Storage directly was limited only by the
-- project-wide maximum. Values below mirror the app's validators exactly:
--   photos     lib/services/storage.ts ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES (2 MiB)
--   documents  ALLOWED_HOMEWORK_MIME (= validateDocumentUpload), MAX_DOCUMENT_BYTES
--              (4,000,000 bytes, lib/uploads/limits.ts)
--   report cards  generated server-side by pdf-lib (application/pdf, a few KB)
-- Existing objects are not checked or changed; the limits apply to new uploads.
--
-- ROLLBACK: UPDATE storage.buckets SET file_size_limit = NULL,
--   allowed_mime_types = NULL WHERE id IN (<the 7 ids below>);

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('student-photos', 'teacher-photos');

UPDATE storage.buckets
SET file_size_limit = 4000000,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ]
WHERE id IN ('homework-attachments', 'notice-attachments', 'fee-receipts', 'pyqs');

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'report-cards';
