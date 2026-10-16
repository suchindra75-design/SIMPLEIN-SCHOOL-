-- SIMPLEIN SCHOOL ERP · Fee payment integrity (maker-checker in the database).
-- Forward-only; re-runnable (CREATE OR REPLACE / DROP … IF EXISTS).
--
-- WHY: fee_payment_records_admin_write (0011) is FOR ALL for school admins, so
-- the maker-checker rule lived only in lib/services/fees.ts. Any admin calling
-- the Supabase API with their own session could verify their own payment,
-- change an amount, or hard-delete a record without an audit entry.
--
-- WHO IS GUARDED: every request-level caller, i.e. role `authenticated` or
-- `anon` (PostgREST / supabase-js with a user session). Detection uses the
-- `role` setting and the JWT role claim, which SECURITY DEFINER functions and
-- foreign-key cascades do not change. Trusted paths are exempt from the rules
-- but still audited: the service-role key (seed scripts, maintenance) and
-- direct database connections (migrations, DBA). The app never uses the
-- service role for fee records.
--
-- RULES for guarded callers on public.fee_payment_records:
--   INSERT  recorded_by = the caller; not verified; not voided; the amount
--           fits the outstanding balance (assignment row locked, so two
--           concurrent recordings cannot overpay).
--   UPDATE  amount, paid_on, mode, reference_no, student_fee_id, school_id,
--           recorded_by, created_at never change (void and record again).
--           Verification: once, in the caller's own name, never by the
--           recorder, never on a voided record; never changed or removed.
--           Voiding: once, never undone, never by the recorder, reason required.
--           Receipt columns may change (audited).
--   DELETE  never (void instead). This also blocks deleting an assignment or
--           fee structure that has payment records (cascade).
-- And on public.student_fees: total_amount cannot drop below the sum of the
-- non-voided payments already recorded.
--
-- AUDIT: an AFTER trigger appends one public.audit_logs row per change (all
-- callers, same transaction), entity 'fee_payment_records', action
-- 'fee_payment.db_*', metadata.via = api_user | service_role | database.
--
-- Errors use SQLSTATE SF001 with a user-facing message (lib/services/errors.ts
-- maps SF001 to a ConflictError).
--
-- ROLLBACK (data is untouched; audit rows stay):
--   DROP TRIGGER IF EXISTS fee_payment_records_integrity ON public.fee_payment_records;
--   DROP TRIGGER IF EXISTS fee_payment_records_audit ON public.fee_payment_records;
--   DROP TRIGGER IF EXISTS student_fees_total_guard ON public.student_fees;
--   DROP FUNCTION IF EXISTS public.fee_payment_records_integrity();
--   DROP FUNCTION IF EXISTS public.fee_payment_records_audit();
--   DROP FUNCTION IF EXISTS public.student_fees_total_guard();
--   DROP FUNCTION IF EXISTS public.fee_request_caller();

-- 1. Who is calling? -----------------------------------------------------------
-- 'api_user'     request with a user/anon session (guarded)
-- 'service_role' request with the service-role key (trusted)
-- 'database'     direct connection without a request JWT (trusted)
CREATE OR REPLACE FUNCTION public.fee_request_caller()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(current_setting('role', true), '') IN ('authenticated', 'anon')
      OR coalesce(auth.jwt() ->> 'role', '') IN ('authenticated', 'anon')
      THEN 'api_user'
    WHEN coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      OR coalesce(current_setting('role', true), '') = 'service_role'
      THEN 'service_role'
    ELSE 'database'
  END;
$$;
REVOKE ALL ON FUNCTION public.fee_request_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fee_request_caller() TO anon, authenticated, service_role;

-- 2. Rules (BEFORE INSERT/UPDATE/DELETE) ------------------------------------------
-- SECURITY DEFINER so the balance check can read and lock the assignment row
-- regardless of the caller's row-level access; the caller check above does not
-- depend on current_user.
CREATE OR REPLACE FUNCTION public.fee_payment_records_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_total NUMERIC(12,2);
  v_paid NUMERIC(12,2);
BEGIN
  IF public.fee_request_caller() <> 'api_user' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment records cannot be deleted. Void the payment instead.'
      USING ERRCODE = 'SF001';
  END IF;

  v_actor := public.current_app_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Only school staff can change payment records.' USING ERRCODE = 'SF001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Only an admin of the row's school can insert at all (RLS WITH CHECK runs
    -- after BEFORE triggers). For anyone else, skip these checks and let RLS /
    -- the tenant trigger reject the row, so nothing about another school's
    -- assignment (e.g. its balance) is revealed here.
    IF NOT (public.is_school_admin() AND NEW.school_id = public.current_school_id()) THEN
      RETURN NEW;
    END IF;
    IF NEW.recorded_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Payments must be recorded in your own name.' USING ERRCODE = 'SF001';
    END IF;
    IF NEW.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'A new payment cannot be recorded as already verified.' USING ERRCODE = 'SF001';
    END IF;
    IF NEW.is_voided OR NEW.void_reason IS NOT NULL THEN
      RAISE EXCEPTION 'A new payment cannot be recorded as voided.' USING ERRCODE = 'SF001';
    END IF;
    SELECT sf.total_amount INTO v_total
      FROM public.student_fees sf
      WHERE sf.id = NEW.student_fee_id AND sf.school_id = NEW.school_id
      FOR UPDATE;
    IF v_total IS NULL THEN
      RETURN NEW; -- other school / missing: the tenant trigger and FK reject it
    END IF;
    SELECT coalesce(sum(r.amount), 0) INTO v_paid
      FROM public.fee_payment_records r
      WHERE r.student_fee_id = NEW.student_fee_id AND NOT r.is_voided;
    IF v_paid + NEW.amount > v_total THEN
      RAISE EXCEPTION 'Amount exceeds the outstanding balance (%).', v_total - v_paid
        USING ERRCODE = 'SF001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.student_fee_id IS DISTINCT FROM OLD.student_fee_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.paid_on IS DISTINCT FROM OLD.paid_on
     OR NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW.reference_no IS DISTINCT FROM OLD.reference_no
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment details cannot be changed after recording. Void the payment and record it again.'
      USING ERRCODE = 'SF001';
  END IF;

  IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    IF OLD.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'A verification cannot be changed or removed.' USING ERRCODE = 'SF001';
    END IF;
    IF NEW.verified_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Payments must be verified in your own name.' USING ERRCODE = 'SF001';
    END IF;
    IF v_actor = OLD.recorded_by THEN
      RAISE EXCEPTION 'Another admin must verify this payment (the admin who recorded it cannot).'
        USING ERRCODE = 'SF001';
    END IF;
    IF OLD.is_voided OR NEW.is_voided THEN
      RAISE EXCEPTION 'A voided payment cannot be verified.' USING ERRCODE = 'SF001';
    END IF;
  END IF;

  IF NEW.is_voided IS DISTINCT FROM OLD.is_voided THEN
    IF OLD.is_voided THEN
      RAISE EXCEPTION 'A voided payment cannot be restored.' USING ERRCODE = 'SF001';
    END IF;
    IF v_actor = OLD.recorded_by THEN
      RAISE EXCEPTION 'Another admin must void this payment (the admin who recorded it cannot).'
        USING ERRCODE = 'SF001';
    END IF;
    IF length(btrim(coalesce(NEW.void_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'A reason is required to void a payment.' USING ERRCODE = 'SF001';
    END IF;
  ELSIF NEW.void_reason IS DISTINCT FROM OLD.void_reason THEN
    RAISE EXCEPTION 'The void reason cannot be changed.' USING ERRCODE = 'SF001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payment_records_integrity ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_records_integrity();

-- 3. Audit (AFTER, every caller, same transaction) --------------------------------
CREATE OR REPLACE FUNCTION public.fee_payment_records_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.fee_payment_records;
  v_action TEXT;
  v_changed TEXT[] := ARRAY[]::TEXT[];
  v_meta JSONB;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_meta := jsonb_build_object('via', public.fee_request_caller(), 'amount', v_row.amount);

  IF TG_OP = 'INSERT' THEN
    v_action := 'fee_payment.db_recorded';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'fee_payment.db_deleted';
    v_meta := v_meta || jsonb_build_object(
      'student_fee_id', OLD.student_fee_id,
      'recorded_by', OLD.recorded_by,
      'verified_by', OLD.verified_by,
      'was_voided', OLD.is_voided
    );
  ELSE
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN v_changed := array_append(v_changed, 'amount'); END IF;
    IF NEW.paid_on IS DISTINCT FROM OLD.paid_on THEN v_changed := array_append(v_changed, 'paid_on'); END IF;
    IF NEW.mode IS DISTINCT FROM OLD.mode THEN v_changed := array_append(v_changed, 'mode'); END IF;
    IF NEW.reference_no IS DISTINCT FROM OLD.reference_no THEN v_changed := array_append(v_changed, 'reference_no'); END IF;
    IF NEW.student_fee_id IS DISTINCT FROM OLD.student_fee_id THEN v_changed := array_append(v_changed, 'student_fee_id'); END IF;
    IF NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN v_changed := array_append(v_changed, 'recorded_by'); END IF;
    IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN v_changed := array_append(v_changed, 'verified_by'); END IF;
    IF NEW.is_voided IS DISTINCT FROM OLD.is_voided THEN v_changed := array_append(v_changed, 'is_voided'); END IF;
    IF NEW.void_reason IS DISTINCT FROM OLD.void_reason THEN v_changed := array_append(v_changed, 'void_reason'); END IF;
    IF NEW.receipt_path IS DISTINCT FROM OLD.receipt_path
       OR NEW.receipt_bucket IS DISTINCT FROM OLD.receipt_bucket
       OR NEW.receipt_name IS DISTINCT FROM OLD.receipt_name
       OR NEW.receipt_mime IS DISTINCT FROM OLD.receipt_mime
       OR NEW.receipt_bytes IS DISTINCT FROM OLD.receipt_bytes THEN
      v_changed := array_append(v_changed, 'receipt');
    END IF;
    IF cardinality(v_changed) = 0 THEN
      RETURN NULL; -- touch-only update (updated_at/version): nothing to audit
    END IF;
    v_action := CASE
      WHEN v_changed = ARRAY['verified_by'] THEN 'fee_payment.db_verified'
      WHEN v_changed <@ ARRAY['is_voided', 'void_reason'] THEN 'fee_payment.db_voided'
      WHEN v_changed = ARRAY['receipt'] THEN 'fee_payment.db_receipt_changed'
      ELSE 'fee_payment.db_updated'
    END;
    v_meta := v_meta || jsonb_build_object('changed', to_jsonb(v_changed));
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN
      v_meta := v_meta || jsonb_build_object('old_amount', OLD.amount);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
  VALUES (v_row.school_id, public.current_app_user_id(), v_action, 'fee_payment_records', v_row.id, v_meta);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fee_payment_records_audit ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_records_audit();

-- 4. Assignment totals cannot drop below what has been paid -------------------------
CREATE OR REPLACE FUNCTION public.student_fees_total_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid NUMERIC(12,2);
BEGIN
  IF public.fee_request_caller() <> 'api_user' OR NEW.total_amount >= OLD.total_amount THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(r.amount), 0) INTO v_paid
    FROM public.fee_payment_records r
    WHERE r.student_fee_id = OLD.id AND NOT r.is_voided;
  IF NEW.total_amount < v_paid THEN
    RAISE EXCEPTION 'The fee total cannot be set below the % already recorded.', v_paid
      USING ERRCODE = 'SF001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_fees_total_guard ON public.student_fees;
CREATE TRIGGER student_fees_total_guard
  BEFORE UPDATE OF total_amount ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.student_fees_total_guard();

-- Trigger functions are not callable through the API, but keep EXECUTE tight.
REVOKE ALL ON FUNCTION public.fee_payment_records_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fee_payment_records_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_fees_total_guard() FROM PUBLIC;
