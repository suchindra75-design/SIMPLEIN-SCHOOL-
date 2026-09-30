-- SIMPLEIN SCHOOL ERP · Phase 14: service-role identity provisioning fix.
-- Forward-only; does not touch 0001–0014.
--
-- ROOT CAUSE (proven live, Phase 14 runtime E2E): prevent_identity_change()
-- (migration 0002) rejects EVERY row-level change to school_id /
-- auth_user_id / email / is_active — including changes made through the
-- trusted service-role provisioning path (admin disable/enable), because
-- triggers fire for all roles. Result: POST /users/:id/disable|enable always
-- 500s, so no account can ever be deactivated (and inactive-denial is
-- untestable).
--
-- FIX (minimum, no weakening): exempt ONLY the service_role JWT inside the
-- trigger. Row-level writers (anon/authenticated JWTs) are still rejected
-- exactly as before — the exemption key is the unforgeable service-role
-- secret, and the service-role client is used solely by trusted server ops
-- (onboarding, user provisioning, enable/disable, role grants). Connections
-- without a JWT (migrations, direct SQL) keep the guard (NULL ≠ match).
-- UPDATE users SET is_active is how disable/enable works; full_name/phone
-- updates never touched identity columns and are unaffected.

CREATE OR REPLACE FUNCTION public.prevent_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Trusted server operations only (service-role key holders). Everyone else
  -- falls through to the immutability guard below.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'identity columns are immutable via row-level access';
  END IF;
  RETURN NEW;
END;
$$;
