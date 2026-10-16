-- SIMPLEIN SCHOOL ERP · Fee receipt evidence integrity.
-- Forward-only; re-runnable (CREATE OR REPLACE / DROP … IF EXISTS).
--
-- WHY:
--   * 0022 left the receipt columns of a payment record editable after
--     verification (audited only), so the recorder could swap the evidence
--     the checker had approved.
--   * fee_receipts_admin_write (0011) is FOR ALL on storage.objects: any
--     admin of the school could overwrite (upsert), move or delete the file
--     behind a verified payment through the Storage API. Direct Storage
--     changes never reach the payment audit trail.
--   * A receipt reference could point at any path, including another
--     family's receipt object.
--
-- RULES for guarded callers (fee_request_caller() = 'api_user', see 0022),
-- on public.fee_payment_records:
--   * The receipt (bucket, path, name, type, size) can be set or replaced
--     only while the payment is unverified and not voided, and not in the
--     same statement that verifies or voids it. There is no re-verification
--     workflow: to correct the evidence of a verified payment, another admin
--     voids it and it is recorded again with the right receipt.
--   * A receipt must live in the fee-receipts bucket under this payment's
--     own folder: schools/<school_id>/fee-receipts/<payment_id>/<file>, the
--     path the app builds (lib/services/storage.ts buildAttachmentPath).
-- On storage.objects (bucket fee-receipts), for user sessions:
--   * INSERT: school admins only, into the folder of an unverified, non-voided
--     payment of their own school.
--   * UPDATE: never (no overwrite/upsert of an existing object, no move).
--   * DELETE: school admins only, and only files no payment record refers to
--     (e.g. a receipt replaced before verification).
--   * SELECT: unchanged (0021). Signed URLs need SELECT, so they are unchanged.
-- The service-role key and direct connections bypass storage RLS and are
-- exempt from the column rules (trusted maintenance, see 0022); they are not
-- recorded by these policies. Objects already stored are not moved or checked.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS fee_payment_records_receipt_guard ON public.fee_payment_records;
--   DROP FUNCTION IF EXISTS public.fee_payment_records_receipt_guard();
--   DROP POLICY IF EXISTS fee_receipts_admin_insert ON storage.objects;
--   DROP POLICY IF EXISTS fee_receipts_admin_delete ON storage.objects;
--   DROP FUNCTION IF EXISTS public.fee_receipt_upload_allowed(TEXT);
--   DROP FUNCTION IF EXISTS public.fee_receipt_is_referenced(TEXT);
--   and re-create fee_receipts_admin_write as in 0011.

-- 1. Receipt columns (BEFORE INSERT/UPDATE) ----------------------------------------
CREATE OR REPLACE FUNCTION public.fee_payment_records_receipt_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_changed BOOLEAN;
BEGIN
  IF public.fee_request_caller() <> 'api_user' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.receipt_path IS NOT NULL OR NEW.receipt_bucket IS NOT NULL
      OR NEW.receipt_name IS NOT NULL OR NEW.receipt_mime IS NOT NULL OR NEW.receipt_bytes IS NOT NULL;
  ELSE
    v_changed := NEW.receipt_path IS DISTINCT FROM OLD.receipt_path
      OR NEW.receipt_bucket IS DISTINCT FROM OLD.receipt_bucket
      OR NEW.receipt_name IS DISTINCT FROM OLD.receipt_name
      OR NEW.receipt_mime IS DISTINCT FROM OLD.receipt_mime
      OR NEW.receipt_bytes IS DISTINCT FROM OLD.receipt_bytes;
    IF v_changed AND (OLD.verified_by IS NOT NULL OR OLD.is_voided) THEN
      RAISE EXCEPTION 'The receipt of a verified or voided payment cannot be changed. Another admin can void the payment so it can be recorded again with the correct receipt.'
        USING ERRCODE = 'SF001';
    END IF;
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;
  IF NEW.verified_by IS NOT NULL OR NEW.is_voided THEN
    RAISE EXCEPTION 'Attach the receipt before the payment is verified or voided, not in the same change.'
      USING ERRCODE = 'SF001';
  END IF;
  IF NEW.receipt_path IS NOT NULL AND (
       NEW.receipt_bucket IS DISTINCT FROM 'fee-receipts'
       OR NEW.receipt_path !~ ('^schools/' || NEW.school_id::text || '/fee-receipts/' || NEW.id::text || '/[^/]+$')
     ) THEN
    RAISE EXCEPTION 'A receipt must be a file uploaded for this payment.' USING ERRCODE = 'SF001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payment_records_receipt_guard ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_receipt_guard
  BEFORE INSERT OR UPDATE ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_records_receipt_guard();
REVOKE ALL ON FUNCTION public.fee_payment_records_receipt_guard() FROM PUBLIC;

-- 2. Storage helpers ------------------------------------------------------------------
-- SECURITY DEFINER: the checks must see every payment record of the caller's
-- school (e.g. voided ones), independent of the caller's own row access.
-- Both are scoped to current_school_id(), so they reveal nothing across schools.

-- True when <payment_folder> is an unverified, non-voided payment of the
-- caller's school (the only payments a receipt may be uploaded for).
CREATE OR REPLACE FUNCTION public.fee_receipt_upload_allowed(payment_folder TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT payment_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.fee_payment_records r
      WHERE r.id = payment_folder::uuid
        AND r.school_id = public.current_school_id()
        AND r.verified_by IS NULL
        AND NOT r.is_voided
    );
$$;

-- True when any payment record of the caller's school refers to the object.
CREATE OR REPLACE FUNCTION public.fee_receipt_is_referenced(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fee_payment_records r
    WHERE r.receipt_path = object_name
      AND r.school_id = public.current_school_id()
  );
$$;

REVOKE ALL ON FUNCTION public.fee_receipt_upload_allowed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fee_receipt_is_referenced(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fee_receipt_upload_allowed(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fee_receipt_is_referenced(TEXT) TO authenticated;

-- 3. Storage policies (replace the FOR ALL write policy) ------------------------------
DROP POLICY IF EXISTS fee_receipts_admin_write ON storage.objects;

DROP POLICY IF EXISTS fee_receipts_admin_insert ON storage.objects;
CREATE POLICY fee_receipts_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND (storage.foldername(name))[3] = 'fee-receipts'
    AND cardinality(storage.foldername(name)) = 4
    AND public.is_school_admin()
    AND public.fee_receipt_upload_allowed((storage.foldername(name))[4])
  );

DROP POLICY IF EXISTS fee_receipts_admin_delete ON storage.objects;
CREATE POLICY fee_receipts_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
    AND NOT public.fee_receipt_is_referenced(name)
  );
-- Deliberately no UPDATE policy for fee-receipts: overwriting or moving an
-- existing receipt object is refused for every user session.
