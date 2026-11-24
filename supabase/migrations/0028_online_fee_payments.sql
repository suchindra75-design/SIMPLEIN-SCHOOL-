-- SIMPLEIN SCHOOL ERP · Online fee payments (UPI via a payment gateway, Razorpay).
-- Forward-only; re-runnable (CREATE … IF NOT EXISTS / CREATE OR REPLACE /
-- DROP … IF EXISTS).
--
-- WHAT THIS ADDS
--   * schools.online_payments_enabled — per-school opt-in (default OFF). The
--     owner turns it on per school once the gateway account is live.
--   * fee_payment_orders — one row per checkout attempt. A parent (for a
--     linked child) or a student (own fees) creates it with their own session;
--     only the server (service role) moves it to PAID / REVIEW.
--   * fee_payment_records.source = 'STAFF' (recorded at the office, as before)
--     or 'GATEWAY' (confirmed by the gateway). Gateway records carry
--     gateway_payment_id / gateway_order_id and mode 'ONLINE'.
--   * public.settle_fee_payment_order(...) — the ONLY way a GATEWAY record is
--     created. Service role only. Idempotent per order and per gateway payment.
--
-- PAID RULE (extends 0011): paid = Σ amount of non-voided records that are
--   verified by a second admin (verified_by IS NOT NULL) OR source = 'GATEWAY'.
--   The gateway's signed, server-checked capture replaces the human checker for
--   online payments; staff records keep maker-checker unchanged.
--
-- MONEY ALREADY TAKEN NEVER FAILS SETTLEMENT: when a captured payment would
--   overpay (the balance changed after the order was created — e.g. cash
--   recorded meanwhile, or two tabs paid), the order becomes REVIEW, no record
--   is written, and an audit row is added. A school admin refunds it from the
--   gateway dashboard. Nothing is applied to the balance automatically.
--
-- GUARDS for API users (fee_request_caller() = 'api_user', see 0022):
--   * fee_payment_records: cannot insert GATEWAY / ONLINE rows or set gateway
--     columns; cannot change source or gateway columns; a GATEWAY record is
--     never verified by staff and never gets a staff receipt. Voiding (another
--     admin, reason required — e.g. after a refund) works as for any record.
--   * fee_payment_orders: insert only status CREATED, in the caller's own name,
--     for a fee the caller may see, for an amount within the outstanding
--     balance, and only when the school has online payments enabled. No user
--     UPDATE or DELETE (no policies).
--
-- ROLLBACK (data stays; audit rows stay):
--   DROP FUNCTION IF EXISTS public.settle_fee_payment_order(TEXT, TEXT, BIGINT, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.note_fee_payment_order_failure(TEXT, TEXT);
--   DROP TABLE IF EXISTS public.fee_payment_orders;
--   DROP TRIGGER IF EXISTS fee_payment_records_gateway_guard ON public.fee_payment_records;
--   DROP FUNCTION IF EXISTS public.fee_payment_records_gateway_guard();
--   and restore private.fee_receipt_upload_allowed from 0027.
--   (Columns can stay; the old app ignores them.)

-- 1. School opt-in -------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS online_payments_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Payment records: source + gateway references ---------------------------------------
ALTER TABLE public.fee_payment_records
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN IF NOT EXISTS gateway TEXT,
  ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_order_id TEXT;

ALTER TABLE public.fee_payment_records
  DROP CONSTRAINT IF EXISTS fee_payment_records_mode_check;
ALTER TABLE public.fee_payment_records
  ADD CONSTRAINT fee_payment_records_mode_check
  CHECK (mode IN ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'OTHER', 'ONLINE'));

ALTER TABLE public.fee_payment_records
  DROP CONSTRAINT IF EXISTS fee_payment_records_source_check;
ALTER TABLE public.fee_payment_records
  ADD CONSTRAINT fee_payment_records_source_check CHECK (
    (source = 'STAFF'
      AND mode <> 'ONLINE'
      AND gateway IS NULL AND gateway_payment_id IS NULL AND gateway_order_id IS NULL)
    OR
    (source = 'GATEWAY'
      AND mode = 'ONLINE'
      AND gateway = 'RAZORPAY'
      AND gateway_payment_id IS NOT NULL AND gateway_order_id IS NOT NULL
      AND verified_by IS NULL
      AND receipt_path IS NULL)
  );

-- One record per gateway payment, ever (a replayed webhook cannot double-count).
CREATE UNIQUE INDEX IF NOT EXISTS fee_payment_records_gateway_payment_uidx
  ON public.fee_payment_records (gateway, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

-- 3. Guard for API users (runs before 0022's integrity trigger: name order) -----------
CREATE OR REPLACE FUNCTION public.fee_payment_records_gateway_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fee_request_caller() <> 'api_user' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.source IS DISTINCT FROM 'STAFF' OR NEW.mode = 'ONLINE'
       OR NEW.gateway IS NOT NULL OR NEW.gateway_payment_id IS NOT NULL
       OR NEW.gateway_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'Online payments are recorded only by the payment gateway.'
        USING ERRCODE = 'SF001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.source IS DISTINCT FROM OLD.source
     OR NEW.gateway IS DISTINCT FROM OLD.gateway
     OR NEW.gateway_payment_id IS DISTINCT FROM OLD.gateway_payment_id
     OR NEW.gateway_order_id IS DISTINCT FROM OLD.gateway_order_id THEN
    RAISE EXCEPTION 'Online payment details cannot be changed.' USING ERRCODE = 'SF001';
  END IF;
  IF OLD.source = 'GATEWAY' THEN
    IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'Online payments are confirmed by the payment gateway and need no verification.'
        USING ERRCODE = 'SF001';
    END IF;
    IF NEW.receipt_path IS DISTINCT FROM OLD.receipt_path
       OR NEW.receipt_bucket IS DISTINCT FROM OLD.receipt_bucket THEN
      RAISE EXCEPTION 'Online payments do not take an office receipt.' USING ERRCODE = 'SF001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payment_records_gateway_guard ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_gateway_guard
  BEFORE INSERT OR UPDATE ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_records_gateway_guard();
REVOKE ALL ON FUNCTION public.fee_payment_records_gateway_guard() FROM PUBLIC;

-- Receipts can be uploaded only for unverified, non-voided STAFF records.
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
        AND r.source = 'STAFF'
        AND r.verified_by IS NULL
        AND NOT r.is_voided
    );
$$;
REVOKE ALL ON FUNCTION private.fee_receipt_upload_allowed(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.fee_receipt_upload_allowed(TEXT) TO authenticated;

-- 4. Orders ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  student_fee_id UUID NOT NULL REFERENCES public.student_fees(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 1),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  gateway TEXT NOT NULL DEFAULT 'RAZORPAY' CHECK (gateway = 'RAZORPAY'),
  gateway_order_id TEXT NOT NULL CHECK (char_length(gateway_order_id) BETWEEN 1 AND 64),
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAID', 'REVIEW')),
  gateway_payment_id TEXT,
  payment_record_id UUID REFERENCES public.fee_payment_records(id),
  last_error TEXT,
  initiated_by UUID NOT NULL REFERENCES public.users(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_order_id),
  CHECK (status <> 'PAID' OR (gateway_payment_id IS NOT NULL AND payment_record_id IS NOT NULL)),
  CHECK (status <> 'REVIEW' OR gateway_payment_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fee_payment_orders_fee_idx
  ON public.fee_payment_orders (student_fee_id);
CREATE INDEX IF NOT EXISTS fee_payment_orders_school_status_idx
  ON public.fee_payment_orders (school_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fee_payment_orders_gateway_payment_uidx
  ON public.fee_payment_orders (gateway, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS fee_payment_orders_touch ON public.fee_payment_orders;
CREATE TRIGGER fee_payment_orders_touch BEFORE UPDATE ON public.fee_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS fee_payment_orders_tenant_assignment ON public.fee_payment_orders;
CREATE TRIGGER fee_payment_orders_tenant_assignment
  BEFORE INSERT OR UPDATE OF student_fee_id, school_id ON public.fee_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('student_fees', 'student_fee_id');
DROP TRIGGER IF EXISTS fee_payment_orders_no_move ON public.fee_payment_orders;
CREATE TRIGGER fee_payment_orders_no_move BEFORE UPDATE OF school_id ON public.fee_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move();

-- Insert rules for API users (RLS decides who; this decides what).
CREATE OR REPLACE FUNCTION public.fee_payment_orders_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(12,2);
  v_recorded NUMERIC(12,2);
  v_enabled BOOLEAN;
BEGIN
  IF public.fee_request_caller() <> 'api_user' THEN
    RETURN NEW;
  END IF;
  IF NEW.initiated_by IS DISTINCT FROM public.current_app_user_id() THEN
    RAISE EXCEPTION 'Payments must be started in your own name.' USING ERRCODE = 'SF001';
  END IF;
  IF NEW.status <> 'CREATED' OR NEW.gateway_payment_id IS NOT NULL
     OR NEW.payment_record_id IS NOT NULL OR NEW.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'A new payment must start unpaid.' USING ERRCODE = 'SF001';
  END IF;
  IF NEW.school_id IS DISTINCT FROM public.current_school_id() THEN
    RETURN NEW; -- RLS rejects it without revealing anything
  END IF;
  -- Only someone allowed to pay this fee learns anything about it (as in 0022):
  -- for anyone else, return and let RLS reject the row.
  IF NOT EXISTS (
    SELECT 1 FROM public.student_fees sf
    WHERE sf.id = NEW.student_fee_id
      AND sf.school_id = NEW.school_id
      AND (
        (public.has_app_role('PARENT') AND public.parent_can_access_student(sf.student_id))
        OR sf.student_id = public.current_student_id()
      )
  ) THEN
    RETURN NEW;
  END IF;
  SELECT s.online_payments_enabled INTO v_enabled FROM public.schools s WHERE s.id = NEW.school_id;
  IF NOT coalesce(v_enabled, false) THEN
    RAISE EXCEPTION 'Online payment is not enabled for this school.' USING ERRCODE = 'SF001';
  END IF;
  SELECT sf.total_amount INTO v_total
    FROM public.student_fees sf
    WHERE sf.id = NEW.student_fee_id AND sf.school_id = NEW.school_id;
  IF v_total IS NULL THEN
    RETURN NEW; -- FK / tenant trigger / RLS reject it
  END IF;
  SELECT coalesce(sum(r.amount), 0) INTO v_recorded
    FROM public.fee_payment_records r
    WHERE r.student_fee_id = NEW.student_fee_id AND NOT r.is_voided;
  IF NEW.amount > v_total - v_recorded THEN
    RAISE EXCEPTION 'Amount exceeds the outstanding balance (%).', v_total - v_recorded
      USING ERRCODE = 'SF001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fee_payment_orders_insert_guard ON public.fee_payment_orders;
CREATE TRIGGER fee_payment_orders_insert_guard
  BEFORE INSERT ON public.fee_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_orders_insert_guard();
REVOKE ALL ON FUNCTION public.fee_payment_orders_insert_guard() FROM PUBLIC;

-- Audit every order insert and status change (database-written, '*.db_*').
CREATE OR REPLACE FUNCTION public.fee_payment_orders_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.last_error IS NOT DISTINCT FROM OLD.last_error THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    NEW.school_id,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.initiated_by ELSE public.current_app_user_id() END,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'fee_payment_order.db_created'
      WHEN NEW.status = 'PAID' THEN 'fee_payment_order.db_paid'
      WHEN NEW.status = 'REVIEW' THEN 'fee_payment_order.db_review'
      ELSE 'fee_payment_order.db_failed_attempt'
    END,
    'fee_payment_orders',
    NEW.id,
    jsonb_build_object(
      'via', public.fee_request_caller(),
      'amount', NEW.amount,
      'student_fee_id', NEW.student_fee_id,
      'gateway_order_id', NEW.gateway_order_id,
      'gateway_payment_id', NEW.gateway_payment_id,
      'payment_record_id', NEW.payment_record_id,
      'reason', NEW.last_error
    )
  );
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS fee_payment_orders_audit ON public.fee_payment_orders;
CREATE TRIGGER fee_payment_orders_audit
  AFTER INSERT OR UPDATE ON public.fee_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_orders_audit();
REVOKE ALL ON FUNCTION public.fee_payment_orders_audit() FROM PUBLIC;

ALTER TABLE public.fee_payment_orders ENABLE ROW LEVEL SECURITY;

-- Read: school admins (own school) and the person who started the order.
DROP POLICY IF EXISTS fee_payment_orders_select ON public.fee_payment_orders;
CREATE POLICY fee_payment_orders_select ON public.fee_payment_orders
  FOR SELECT TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR initiated_by = public.current_app_user_id())
  );

-- Insert: a parent for a linked child, or a student for their own fee.
DROP POLICY IF EXISTS fee_payment_orders_insert ON public.fee_payment_orders;
CREATE POLICY fee_payment_orders_insert ON public.fee_payment_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND initiated_by = public.current_app_user_id()
    AND status = 'CREATED'
    AND EXISTS (
      SELECT 1 FROM public.student_fees sf
      WHERE sf.id = fee_payment_orders.student_fee_id
        AND sf.school_id = public.current_school_id()
        AND (
          (public.has_app_role('PARENT') AND public.parent_can_access_student(sf.student_id))
          OR sf.student_id = public.current_student_id()
        )
    )
  );
-- Deliberately no UPDATE or DELETE policy: only the server settles orders.

REVOKE TRUNCATE ON public.fee_payment_orders FROM anon, authenticated;

-- 5. Settlement (service role only) -----------------------------------------------------
-- Called after the server has (a) checked the gateway signature and (b) fetched
-- the payment from the gateway API and seen it captured for this order.
-- Returns: status ('PAID' | 'REVIEW' | 'UNKNOWN_ORDER'), payment_record_id.
CREATE OR REPLACE FUNCTION public.settle_fee_payment_order(
  p_gateway_order_id TEXT,
  p_gateway_payment_id TEXT,
  p_amount_paise BIGINT,
  p_paid_at TIMESTAMPTZ
)
RETURNS TABLE (status TEXT, payment_record_id UUID, order_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_order public.fee_payment_orders;
  v_total NUMERIC(12,2);
  v_recorded NUMERIC(12,2);
  v_record_id UUID;
  v_tz TEXT;
BEGIN
  IF p_gateway_payment_id IS NULL OR btrim(p_gateway_payment_id) = '' THEN
    RAISE EXCEPTION 'A gateway payment id is required.' USING ERRCODE = 'SF001';
  END IF;

  SELECT * INTO v_order FROM public.fee_payment_orders o
    WHERE o.gateway = 'RAZORPAY' AND o.gateway_order_id = p_gateway_order_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNKNOWN_ORDER'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Idempotent: already settled (webhook and browser confirmation both arrive).
  IF v_order.status IN ('PAID', 'REVIEW') THEN
    IF v_order.gateway_payment_id IS DISTINCT FROM p_gateway_payment_id THEN
      -- A second, different payment captured against the same order.
      INSERT INTO public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
      VALUES (v_order.school_id, NULL, 'fee_payment_order.db_duplicate_capture', 'fee_payment_orders',
              v_order.id, jsonb_build_object('via', public.fee_request_caller(),
                'gateway_payment_id', p_gateway_payment_id, 'amount_paise', p_amount_paise));
      RETURN QUERY SELECT 'REVIEW'::TEXT, v_order.payment_record_id, v_order.id;
      RETURN;
    END IF;
    RETURN QUERY SELECT v_order.status, v_order.payment_record_id, v_order.id;
    RETURN;
  END IF;

  -- The captured amount must be exactly the order amount.
  IF p_amount_paise IS DISTINCT FROM round(v_order.amount * 100)::BIGINT THEN
    UPDATE public.fee_payment_orders o
      SET status = 'REVIEW', gateway_payment_id = p_gateway_payment_id,
          paid_at = p_paid_at, last_error = 'Captured amount differs from the order amount'
      WHERE o.id = v_order.id;
    RETURN QUERY SELECT 'REVIEW'::TEXT, NULL::UUID, v_order.id;
    RETURN;
  END IF;

  -- Lock the assignment (same lock 0022 takes) and re-check the balance.
  SELECT sf.total_amount INTO v_total
    FROM public.student_fees sf WHERE sf.id = v_order.student_fee_id FOR UPDATE;
  SELECT coalesce(sum(r.amount), 0) INTO v_recorded
    FROM public.fee_payment_records r
    WHERE r.student_fee_id = v_order.student_fee_id AND NOT r.is_voided;
  IF v_total IS NULL OR v_recorded + v_order.amount > v_total THEN
    UPDATE public.fee_payment_orders o
      SET status = 'REVIEW', gateway_payment_id = p_gateway_payment_id,
          paid_at = p_paid_at, last_error = 'Payment would exceed the outstanding balance; refund or adjust'
      WHERE o.id = v_order.id;
    RETURN QUERY SELECT 'REVIEW'::TEXT, NULL::UUID, v_order.id;
    RETURN;
  END IF;

  SELECT coalesce(s.timezone, 'Asia/Kolkata') INTO v_tz FROM public.schools s WHERE s.id = v_order.school_id;

  INSERT INTO public.fee_payment_records (
    school_id, student_fee_id, amount, paid_on, mode, reference_no,
    recorded_by, source, gateway, gateway_payment_id, gateway_order_id
  ) VALUES (
    v_order.school_id, v_order.student_fee_id, v_order.amount,
    (coalesce(p_paid_at, now()) AT TIME ZONE v_tz)::DATE, 'ONLINE', p_gateway_payment_id,
    v_order.initiated_by, 'GATEWAY', 'RAZORPAY', p_gateway_payment_id, v_order.gateway_order_id
  )
  RETURNING id INTO v_record_id;

  UPDATE public.fee_payment_orders o
    SET status = 'PAID', gateway_payment_id = p_gateway_payment_id,
        payment_record_id = v_record_id, paid_at = coalesce(p_paid_at, now()), last_error = NULL
    WHERE o.id = v_order.id;

  RETURN QUERY SELECT 'PAID'::TEXT, v_record_id, v_order.id;
END;
$$;

-- Records a failed attempt (the order stays CREATED: the payer may retry).
CREATE OR REPLACE FUNCTION public.note_fee_payment_order_failure(
  p_gateway_order_id TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.fee_payment_orders o
    SET last_error = left(coalesce(p_reason, 'Payment failed'), 200)
    WHERE o.gateway = 'RAZORPAY' AND o.gateway_order_id = p_gateway_order_id
      AND o.status = 'CREATED';
$$;

-- Not callable through the API by users: service role only.
REVOKE ALL ON FUNCTION public.settle_fee_payment_order(TEXT, TEXT, BIGINT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.note_fee_payment_order_failure(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_fee_payment_order(TEXT, TEXT, BIGINT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.note_fee_payment_order_failure(TEXT, TEXT) TO service_role;
