-- SIMPLEIN SCHOOL ERP · Fee assignment integrity (follow-up to 0022).
-- Forward-only; re-runnable (CREATE OR REPLACE / DROP … IF EXISTS).
--
-- WHY: student_fees_admin_write (0011) is FOR ALL for school admins and 0022
-- only guarded total_amount. A single admin calling the Supabase API with
-- their own session could re-point a paid, verified assignment at another
-- student (or another fee structure): the payments follow the assignment, so
-- one student's verified payment silently became another's, with no
-- database audit entry. Payment records could also be inserted with a
-- back-dated created_at.
--
-- RULES for guarded callers (fee_request_caller() = 'api_user', see 0022):
--   student_fees UPDATE  student_id, fee_structure_id and school_id cannot
--                        change once the assignment has ANY payment record
--                        (voided ones included: they are part of its
--                        history). Unpaid assignments keep the existing
--                        admin workflows (assign, re-assign, totals, due
--                        dates, delete). created_at never changes.
--   student_fees INSERT  created_at/updated_at are set by the server.
--   fee_payment_records INSERT  created_at/updated_at are set by the server
--                        and version starts at 1 (0022 already freezes
--                        created_at on UPDATE).
-- Trusted paths (service role, direct DB) stay exempt, as in 0022, and are
-- audited.
--
-- CONCURRENCY (READ COMMITTED, the only level PostgREST requests use):
--   * A guarded payment INSERT locks the assignment row (0022, SELECT … FOR
--     UPDATE) before checking the balance. A re-assignment UPDATE needs a
--     conflicting row lock, so the two serialise on that row.
--   * Payment first: the UPDATE waits for the payment's transaction; the
--     guard below then runs a fresh query (new snapshot per statement in a
--     plpgsql trigger), sees the committed payment and refuses.
--   * Re-assignment first: the payment waits, then locks the (already
--     re-assigned) row; it is recorded against the assignment as it now is,
--     after an audited re-assignment of an assignment that had no payments.
--   * Trusted inserts do not take the 0022 lock, but their foreign-key check
--     takes FOR KEY SHARE on the assignment; changing student_id or
--     fee_structure_id (columns of a unique key) needs FOR UPDATE, which
--     conflicts, so they serialise too. school_id never changes (0011).
--
-- AUDIT: an AFTER trigger appends one audit_logs row per assignment change
-- (all callers, same transaction): fee_assignment.db_created / db_updated /
-- db_reassigned / db_deleted, metadata.via = api_user | service_role |
-- database. Updates that change none of student, structure, school, total
-- or due date (e.g. an idempotent re-assign upsert) are not logged. The app's
-- own bulk event (fee_assigned, entity_id NULL) stays: it records the batch,
-- these rows record each assignment.
--
-- ROLLBACK (data is untouched; audit rows stay):
--   DROP TRIGGER IF EXISTS student_fees_assignment_guard ON public.student_fees;
--   DROP TRIGGER IF EXISTS student_fees_audit ON public.student_fees;
--   DROP TRIGGER IF EXISTS fee_payment_records_server_time ON public.fee_payment_records;
--   DROP FUNCTION IF EXISTS public.student_fees_assignment_guard();
--   DROP FUNCTION IF EXISTS public.student_fees_audit();
--   DROP FUNCTION IF EXISTS public.fee_payment_records_server_time();

-- 1. Assignment guard (BEFORE INSERT/UPDATE) --------------------------------------
-- SECURITY DEFINER so the payment check sees every record of the assignment,
-- whatever the caller's row-level access.
CREATE OR REPLACE FUNCTION public.student_fees_assignment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.fee_request_caller() <> 'api_user' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'The creation time of a fee assignment cannot be changed.'
      USING ERRCODE = 'SF001';
  END IF;

  IF (NEW.student_id IS DISTINCT FROM OLD.student_id
      OR NEW.fee_structure_id IS DISTINCT FROM OLD.fee_structure_id
      OR NEW.school_id IS DISTINCT FROM OLD.school_id)
     AND EXISTS (
       SELECT 1 FROM public.fee_payment_records r WHERE r.student_fee_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'This fee assignment has payment records, so its student and fee structure cannot be changed. Assign the fee to the correct student and record the payment there; void the wrong payment.'
      USING ERRCODE = 'SF001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_fees_assignment_guard ON public.student_fees;
CREATE TRIGGER student_fees_assignment_guard
  BEFORE INSERT OR UPDATE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.student_fees_assignment_guard();

-- 2. Assignment audit (AFTER, every caller, same transaction) ----------------------
CREATE OR REPLACE FUNCTION public.student_fees_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.student_fees;
  v_action TEXT;
  v_changed TEXT[] := ARRAY[]::TEXT[];
  v_meta JSONB;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_meta := jsonb_build_object(
    'via', public.fee_request_caller(),
    'student_id', v_row.student_id,
    'fee_structure_id', v_row.fee_structure_id,
    'total_amount', v_row.total_amount
  );

  IF TG_OP = 'INSERT' THEN
    v_action := 'fee_assignment.db_created';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'fee_assignment.db_deleted';
  ELSE
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      v_changed := array_append(v_changed, 'student_id');
      v_meta := v_meta || jsonb_build_object('old_student_id', OLD.student_id);
    END IF;
    IF NEW.fee_structure_id IS DISTINCT FROM OLD.fee_structure_id THEN
      v_changed := array_append(v_changed, 'fee_structure_id');
      v_meta := v_meta || jsonb_build_object('old_fee_structure_id', OLD.fee_structure_id);
    END IF;
    IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
      v_changed := array_append(v_changed, 'school_id');
    END IF;
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      v_changed := array_append(v_changed, 'total_amount');
      v_meta := v_meta || jsonb_build_object('old_total_amount', OLD.total_amount);
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      v_changed := array_append(v_changed, 'due_date');
      v_meta := v_meta || jsonb_build_object('old_due_date', OLD.due_date);
    END IF;
    IF cardinality(v_changed) = 0 THEN
      RETURN NULL; -- touch-only or idempotent upsert: nothing to audit
    END IF;
    v_action := CASE
      WHEN v_changed && ARRAY['student_id', 'fee_structure_id', 'school_id'] THEN 'fee_assignment.db_reassigned'
      ELSE 'fee_assignment.db_updated'
    END;
    v_meta := v_meta || jsonb_build_object('changed', to_jsonb(v_changed));
  END IF;

  INSERT INTO public.audit_logs (school_id, actor_id, action, entity, entity_id, metadata)
  VALUES (v_row.school_id, public.current_app_user_id(), v_action, 'student_fees', v_row.id, v_meta);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS student_fees_audit ON public.student_fees;
CREATE TRIGGER student_fees_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.student_fees_audit();

-- 3. Payment records: server-assigned creation time (BEFORE INSERT) ----------------
CREATE OR REPLACE FUNCTION public.fee_payment_records_server_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fee_request_caller() = 'api_user' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.version := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payment_records_server_time ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_server_time
  BEFORE INSERT ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_records_server_time();

REVOKE ALL ON FUNCTION public.student_fees_assignment_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_fees_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fee_payment_records_server_time() FROM PUBLIC;
