-- SIMPLEIN SCHOOL ERP · foundation migration (outline).
-- Full DDL per docs/DATABASE.md lands in roadmap steps 2-6.
-- This file establishes roles, tenant root, identity profile,
-- and the RLS pattern every tenant table MUST follow.

-- 1. Roles ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tenant root ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) >= 2),
  slug TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  primary_color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Identity profile (links auth.users -> tenant) ------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE, -- REFERENCES auth.users(id) ON DELETE CASCADE (applied when Supabase project linked)
  school_id UUID NOT NULL REFERENCES public.schools(id),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, email)
);
CREATE INDEX IF NOT EXISTS users_school_active_idx
  ON public.users (school_id, is_active);

-- 4. Role assignments ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

-- 5. RLS pattern (copy per tenant table) -----------------------------------
-- ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "<table>_select_same_school" ON public.<table>
-- FOR SELECT USING (
--   EXISTS (SELECT 1 FROM public.users u
--           WHERE u.auth_user_id = auth.uid()
--             AND u.is_active
--             AND u.school_id = <table>.school_id)
-- );
-- INSERT/UPDATE/DELETE add WITH CHECK (same predicate) + role helpers
-- is_school_admin() / teaches_section() / linked_parent() (see DATABASE.md §14).

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
