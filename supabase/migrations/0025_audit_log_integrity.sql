-- SIMPLEIN SCHOOL ERP · Audit log integrity.
-- Forward-only; re-runnable (CREATE OR REPLACE / DROP … IF EXISTS).
--
-- WHY:
--   * audit_logs_append (0003) let any active member append any row about
--     their own school with themselves as actor. A teacher (or an admin) could
--     therefore append rows that look exactly like the ones the database
--     writes (fee_payment.db_verified / db_voided with metadata.via =
--     api_user), so a reviewer could not tell a forged entry from a real one.
--   * Nothing at the database level stopped the service-role key, or a direct
--     connection, from editing or deleting audit rows (RLS does not apply to
--     them), and anon/authenticated held TRUNCATE on every public table.
--   * Callers could choose created_at on the rows they append.
--
-- WHAT CHANGES:
--   1. Appends through the API (role authenticated) are still allowed for the
--      app's own events, but never with an action containing '.db_' (reserved
--      for database triggers: fee_payment.db_*, fee_assignment.db_*), never
--      with a metadata.via key (the trigger provenance marker), and fee events
--      (fee* actions, fee tables as entity) only from school admins, the only
--      role with fee write access. The actor is still always the caller.
--      Rows written by the database triggers are inserted by their SECURITY
--      DEFINER owner, to which this policy does not apply.
--   2. A trigger refuses UPDATE, DELETE and TRUNCATE of audit_logs for every
--      role, including the service-role key and direct connections.
--   3. API callers cannot choose created_at (set to now()).
--   4. TRUNCATE is revoked from anon and authenticated on all public tables
--      (and for tables created later by the migration role). PostgREST never
--      issues TRUNCATE; this removes the privilege as defence in depth.
--
-- LIMITS (by design, see docs/DATABASE_TRUST_MODEL.md): the table owner can
-- still DISABLE or DROP these triggers (ALTER TABLE requires ownership; the
-- service role does not own the table), and a superuser can bypass them. The
-- triggers stop the app, API users and the service-role key; they do not stop
-- whoever holds the database owner's password. Rows written by the app
-- through logAudit are self-attested by the actor; rows written by database
-- triggers ('*.db_*') are the authoritative record for fees.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
--   DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
--   DROP TRIGGER IF EXISTS audit_logs_server_time ON public.audit_logs;
--   DROP FUNCTION IF EXISTS public.audit_logs_append_only();
--   DROP FUNCTION IF EXISTS public.audit_logs_server_time();
--   and re-create audit_logs_append as in 0003. TRUNCATE can be re-granted
--   with GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO anon, authenticated.

-- 1. Append policy ---------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_append ON public.audit_logs;
CREATE POLICY audit_logs_append ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND actor_id = public.current_app_user_id()
    AND strpos(action, '.db_') = 0
    AND NOT (metadata ? 'via')
    AND (
      public.is_school_admin()
      OR NOT (
        action LIKE 'fee%'
        OR entity IN ('fee_structures', 'fee_components', 'student_fees', 'fee_payment_records')
      )
    )
  );

-- 2. Append-only for every role ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit records cannot be changed or deleted.' USING ERRCODE = 'SF001';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_append_only();

-- 3. Server-assigned time for API appends --------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_logs_server_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fee_request_caller() = 'api_user' THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_server_time ON public.audit_logs;
CREATE TRIGGER audit_logs_server_time
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_server_time();

REVOKE ALL ON FUNCTION public.audit_logs_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_logs_server_time() FROM PUBLIC;

-- 4. No TRUNCATE for API roles -------------------------------------------------------
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
