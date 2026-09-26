-- SIMPLEIN SCHOOL ERP · Phase 11: Fee Tracking (NO payment processing).
-- Extends 0001–0010 WITHOUT duplicating them. Reuses touch_updated_at(),
-- current_app_user_id(), current_school_id(), is_school_admin(),
-- has_app_role(), parent_can_access_student(), assert_child_same_school(),
-- prevent_school_move().
--
-- V1 RECORDS-ONLY MODEL (docs/ARCHITECTURE.md §25): fee_payment_records are
-- amounts a school staff member recorded as received (offline cash/cheque/
-- transfer). There is NO gateway, NO settlement, NO refunds — corrections are
-- superseding audited records, never silent edits or gateway vocabulary.
--
-- Balance/concession rule (one consistent rule, documented):
-- - paid = Σ(amount WHERE NOT is_voided AND verified_by IS NOT NULL)
-- - due  = total_amount − paid (never negative: overpayment rejected)
-- - concession = the assignment's total_amount snapshot set BELOW the
--   structure total (per-student discount); full waiver = 0.
-- - status computed: PAID (paid >= total) / PARTIAL (paid > 0) / DUE,
--   overdue when due_date < today AND due > 0.

-- 1. fee_structures -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  due_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, academic_year_id, name)
);
CREATE INDEX IF NOT EXISTS fee_structures_school_year_idx
  ON public.fee_structures (school_id, academic_year_id);
DROP TRIGGER IF EXISTS fee_structures_touch ON public.fee_structures;
CREATE TRIGGER fee_structures_touch BEFORE UPDATE ON public.fee_structures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. fee_components ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  fee_structure_id UUID NOT NULL
    REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_components_structure_idx
  ON public.fee_components (fee_structure_id);
DROP TRIGGER IF EXISTS fee_components_touch ON public.fee_components;
CREATE TRIGGER fee_components_touch BEFORE UPDATE ON public.fee_components
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. student_fees (assignments; concession via total_amount snapshot) ----------------
CREATE TABLE IF NOT EXISTS public.student_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  fee_structure_id UUID NOT NULL
    REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0), -- concession snapshot
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, fee_structure_id)
);
CREATE INDEX IF NOT EXISTS student_fees_school_student_idx
  ON public.student_fees (school_id, student_id);
CREATE INDEX IF NOT EXISTS student_fees_school_due_idx
  ON public.student_fees (school_id, due_date);
DROP TRIGGER IF EXISTS student_fees_touch ON public.student_fees;
CREATE TRIGGER student_fees_touch BEFORE UPDATE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. fee_payment_records (school-recorded receipts; NOT online transactions) -----------
CREATE TABLE IF NOT EXISTS public.fee_payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  student_fee_id UUID NOT NULL
    REFERENCES public.student_fees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'OTHER')),
  reference_no TEXT,
  receipt_bucket TEXT,
  receipt_path TEXT,
  receipt_name TEXT,
  receipt_mime TEXT,
  receipt_bytes INTEGER CHECK (receipt_bytes IS NULL OR receipt_bytes > 0),
  recorded_by UUID NOT NULL REFERENCES public.users(id),
  verified_by UUID REFERENCES public.users(id),
  is_voided BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_payment_records_student_fee_idx
  ON public.fee_payment_records (student_fee_id);
CREATE INDEX IF NOT EXISTS fee_payment_records_school_date_idx
  ON public.fee_payment_records (school_id, paid_on DESC);
DROP TRIGGER IF EXISTS fee_payment_records_touch ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_touch BEFORE UPDATE ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Tenant triggers (Phase 3 pattern) ----------------------------------------------------
DROP TRIGGER IF EXISTS fee_components_tenant_structure ON public.fee_components;
CREATE TRIGGER fee_components_tenant_structure BEFORE INSERT OR UPDATE OF fee_structure_id, school_id ON public.fee_components
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('fee_structures', 'fee_structure_id');
DROP TRIGGER IF EXISTS student_fees_tenant_student ON public.student_fees;
CREATE TRIGGER student_fees_tenant_student BEFORE INSERT OR UPDATE OF student_id, school_id ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('students', 'student_id');
DROP TRIGGER IF EXISTS student_fees_tenant_structure ON public.student_fees;
CREATE TRIGGER student_fees_tenant_structure BEFORE INSERT OR UPDATE OF fee_structure_id, school_id ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('fee_structures', 'fee_structure_id');
DROP TRIGGER IF EXISTS fee_payment_records_tenant_assignment ON public.fee_payment_records;
CREATE TRIGGER fee_payment_records_tenant_assignment BEFORE INSERT OR UPDATE OF student_fee_id, school_id ON public.fee_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.assert_child_same_school('student_fees', 'student_fee_id');
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_structures', 'fee_components', 'student_fees', 'fee_payment_records'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_move', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF school_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_school_move()',
      t || '_no_move', t
    );
  END LOOP;
END;
$$;

-- 6. Private storage bucket + policies ------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('fee-receipts', 'fee-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS fee_receipts_select ON storage.objects;
CREATE POLICY fee_receipts_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
  );
DROP POLICY IF EXISTS fee_receipts_admin_write ON storage.objects;
CREATE POLICY fee_receipts_admin_write ON storage.objects
  FOR ALL USING (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  )
  WITH CHECK (
    bucket_id = 'fee-receipts'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.current_school_id()::text
    AND public.is_school_admin()
  );

-- 7. RLS ---------------------------------------------------------------------------
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payment_records ENABLE ROW LEVEL SECURITY;

-- Structures/components: members read (parents see assigned structures via the
-- service scope); admin writes.
DROP POLICY IF EXISTS fee_structures_select ON public.fee_structures;
CREATE POLICY fee_structures_select ON public.fee_structures
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS fee_structures_admin_write ON public.fee_structures;
CREATE POLICY fee_structures_admin_write ON public.fee_structures
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
DROP POLICY IF EXISTS fee_components_select ON public.fee_components;
CREATE POLICY fee_components_select ON public.fee_components
  FOR SELECT USING (school_id = public.current_school_id());
DROP POLICY IF EXISTS fee_components_admin_write ON public.fee_components;
CREATE POLICY fee_components_admin_write ON public.fee_components
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- Student fees: admins (own school) + parents via linked children ONLY.
DROP POLICY IF EXISTS student_fees_select ON public.student_fees;
CREATE POLICY student_fees_select ON public.student_fees
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR public.parent_can_access_student(student_fees.student_id)
    )
  );
DROP POLICY IF EXISTS student_fees_admin_write ON public.student_fees;
CREATE POLICY student_fees_admin_write ON public.student_fees
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );

-- Payment records: same visibility as the owning assignment; parents see
-- non-voided records only; writes are admin-only.
DROP POLICY IF EXISTS fee_payment_records_select ON public.fee_payment_records;
CREATE POLICY fee_payment_records_select ON public.fee_payment_records
  FOR SELECT USING (
    school_id = public.current_school_id()
    AND (
      public.is_school_admin()
      OR (
        public.parent_can_access_student(
          (SELECT sf.student_id FROM public.student_fees sf
           WHERE sf.id = fee_payment_records.student_fee_id)
        )
        AND NOT fee_payment_records.is_voided
      )
    )
  );
DROP POLICY IF EXISTS fee_payment_records_admin_write ON public.fee_payment_records;
CREATE POLICY fee_payment_records_admin_write ON public.fee_payment_records
  FOR ALL USING (
    school_id = public.current_school_id() AND public.is_school_admin()
  )
  WITH CHECK (
    school_id = public.current_school_id() AND public.is_school_admin()
  );
