-- SIMPLEIN SCHOOL ERP · Phase 2: auth + school/tenant + user/RBAC foundation.
-- Extends 0001_foundation.sql WITHOUT duplicating it. Supabase Auth remains the
-- sole source of truth for credentials; public.users only links auth.users.id
-- to tenant/role data. Passwords are NEVER stored here.

-- 1. Complete schools ------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS logo_path TEXT; -- Storage path; FK to documents lands with the documents module

-- 2. updated_at maintenance -------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_touch_updated_at ON public.schools;
CREATE TRIGGER schools_touch_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS users_touch_updated_at ON public.users;
CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Identity-resolution helpers (SECURITY DEFINER, fixed search_path) ------
-- These map the Supabase JWT (auth.uid()) to the application tenant WITHOUT
-- trusting any client-supplied school id. RLS policies below use them.

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.school_id FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_app_role(required public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.user_id = public.current_app_user_id()
      AND r.role = required
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.has_app_role('SCHOOL_ADMIN');
$$;

-- 4. Guard: identity columns can never be changed by row-level writers ------
-- school_id / auth_user_id / email / is_active change only via trusted
-- server operations (service-role onboarding / admin provisioning), which
-- bypass RLS. This trigger makes that boundary database-enforced.
CREATE OR REPLACE FUNCTION public.prevent_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'identity columns are immutable via row-level access';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_prevent_identity_change ON public.users;
CREATE TRIGGER users_prevent_identity_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_identity_change();

-- 5. RLS policies ------------------------------------------------------------
-- Authenticated (anon-key + JWT) access only. The service-role key bypasses
-- RLS and is reserved for trusted server ops (onboarding, user provisioning).

-- schools: members read their own school; admins manage it; creation and
-- deletion happen only via trusted server ops (no authenticated INSERT/DELETE).
DROP POLICY IF EXISTS schools_select_own ON public.schools;
CREATE POLICY schools_select_own ON public.schools
  FOR SELECT USING (id = public.current_school_id());

DROP POLICY IF EXISTS schools_admin_update ON public.schools;
CREATE POLICY schools_admin_update ON public.schools
  FOR UPDATE USING (
    id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    id = public.current_school_id() AND public.is_school_admin()
  );

-- users: everyone reads their own profile; school admins read all profiles
-- of their school; anyone may update their own non-identity columns
-- (trigger §4 blocks privilege/tenant changes); no authenticated INSERT/DELETE.
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT USING (
    id = public.current_app_user_id()
    OR (
      school_id = public.current_school_id()
      AND public.is_school_admin()
    )
  );

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());

-- user_roles: everyone reads their own grants; school admins read all grants
-- of their school; grants are written only via trusted server ops.
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT USING (
    user_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_roles.user_id
        AND u.school_id = public.current_school_id()
    AND public.is_school_admin()
    )
  );
