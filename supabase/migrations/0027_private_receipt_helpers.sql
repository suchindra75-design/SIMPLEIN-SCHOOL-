-- SIMPLEIN SCHOOL ERP · Receipt policy helpers out of the API schema.
-- Forward-only; re-runnable (CREATE … IF NOT EXISTS / CREATE OR REPLACE /
-- DROP … IF EXISTS).
--
-- WHY: 0026 created public.fee_receipt_upload_allowed(text) and
-- public.fee_receipt_is_referenced(text) as SECURITY DEFINER functions
-- granted to `authenticated`. Every function in `public` is also an API
-- endpoint (POST /rest/v1/rpc/<name>), so any signed-in member — a student,
-- a parent, a teacher — could ask whether a payment id is an unverified
-- payment of their school, or whether a storage path is a referenced
-- receipt, without being able to read those rows. Low impact (ids are not
-- guessable), but these functions exist only for the storage policies.
--
-- WHAT CHANGES: the two helpers move, unchanged, to a new schema `private`.
-- PostgREST serves only the schemas listed in supabase/config.toml [api]
-- schemas (public, graphql_public), so `private` functions are not API
-- endpoints. `authenticated` keeps USAGE on the schema and EXECUTE on the two
-- functions, because the storage policies are evaluated as the caller. The
-- fee-receipts policies are re-created to call the private versions, then the
-- public ones are dropped. Behaviour of the policies is unchanged.
-- Hosted projects: keep `private` out of "Exposed schemas" in the API settings.
--
-- ROLLBACK: re-run section 2 and 3 of 0026 (re-creates the public helpers and
-- the policies that call them), then DROP SCHEMA private CASCADE if nothing
-- else uses it.

-- 1. Schema ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- 2. Helpers (same bodies as in 0026) ------------------------------------------------
-- True when <payment_folder> is an unverified, non-voided payment of the
-- caller's school (the only payments a receipt may be uploaded for).
CREATE OR REPLACE FUNCTION private.fee_receipt_upload_allowed(payment_folder TEXT)
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
CREATE OR REPLACE FUNCTION private.fee_receipt_is_referenced(object_name TEXT)
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

REVOKE ALL ON FUNCTION private.fee_receipt_upload_allowed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fee_receipt_is_referenced(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.fee_receipt_upload_allowed(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.fee_receipt_is_referenced(TEXT) TO authenticated;

-- 3. Storage policies call the private helpers (otherwise as in 0026) ---------------
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
    AND private.fee_receipt_upload_allowed((storage.foldername(name))[4])
  );

DROP POLICY IF EXISTS fee_receipts_admin_delete ON storage.objects;
CREATE POLICY fee_receipts_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
    AND NOT private.fee_receipt_is_referenced(name)
  );

-- 4. The public (API-callable) versions are no longer used ---------------------------
DROP FUNCTION IF EXISTS public.fee_receipt_upload_allowed(TEXT);
DROP FUNCTION IF EXISTS public.fee_receipt_is_referenced(TEXT);
