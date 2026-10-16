-- SIMPLEIN SCHOOL ERP · Read-only data check before applying 0022–0026.
--
-- Migrations 0022–0026 enforce the fee and audit rules for NEW changes only;
-- they do not inspect rows that already exist. Run this on a database (with
-- a backup taken) BEFORE applying them, and review every row it returns.
-- It changes nothing: the whole script runs in a READ ONLY transaction.
--
--   psql "<connection string of the target database>" -X -f scripts/sql/fee-integrity-precheck.sql
--
-- Each query lists problems; an empty result means none were found. It shows
-- ids and amounts only (no names, e-mails or phone numbers).

BEGIN TRANSACTION READ ONLY;

\echo '1. Payments verified by the admin who recorded them (maker-checker broken)'
SELECT r.school_id, r.id AS payment_id, r.amount, r.paid_on, r.recorded_by
FROM public.fee_payment_records r
WHERE r.verified_by IS NOT NULL AND r.verified_by = r.recorded_by
ORDER BY r.school_id, r.paid_on;

\echo '2. Assignments whose recorded (non-voided) payments exceed the total'
SELECT sf.school_id, sf.id AS student_fee_id, sf.total_amount, sum(r.amount) AS recorded
FROM public.student_fees sf
JOIN public.fee_payment_records r ON r.student_fee_id = sf.id AND NOT r.is_voided
GROUP BY sf.school_id, sf.id, sf.total_amount
HAVING sum(r.amount) > sf.total_amount
ORDER BY sf.school_id;

\echo '3. Payments recorded or verified by someone who is not a school admin of that school'
SELECT r.school_id, r.id AS payment_id, 'recorded_by' AS role_column, r.recorded_by AS user_id
FROM public.fee_payment_records r
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE u.id = r.recorded_by AND u.school_id = r.school_id AND ur.role = 'SCHOOL_ADMIN')
UNION ALL
SELECT r.school_id, r.id, 'verified_by', r.verified_by
FROM public.fee_payment_records r
WHERE r.verified_by IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE u.id = r.verified_by AND u.school_id = r.school_id AND ur.role = 'SCHOOL_ADMIN')
ORDER BY 1, 2;

\echo '4. Voided payments without a reason'
SELECT r.school_id, r.id AS payment_id, r.amount
FROM public.fee_payment_records r
WHERE r.is_voided AND length(btrim(coalesce(r.void_reason, ''))) = 0;

\echo '5. Receipts outside the payment''s own folder or bucket (0026 requires schools/<school>/fee-receipts/<payment>/<file>)'
SELECT r.school_id, r.id AS payment_id, r.receipt_bucket, r.receipt_path
FROM public.fee_payment_records r
WHERE r.receipt_path IS NOT NULL
  AND (r.receipt_bucket IS DISTINCT FROM 'fee-receipts'
       OR r.receipt_path !~ ('^schools/' || r.school_id::text || '/fee-receipts/' || r.id::text || '/[^/]+$'));

\echo '6. Receipts whose file is missing from Storage'
SELECT r.school_id, r.id AS payment_id, r.receipt_path
FROM public.fee_payment_records r
WHERE r.receipt_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'fee-receipts' AND o.name = r.receipt_path);

\echo '7. Payments or assignments that cross schools (the tenant triggers should make this empty)'
SELECT r.school_id, r.id AS payment_id, sf.school_id AS assignment_school
FROM public.fee_payment_records r JOIN public.student_fees sf ON sf.id = r.student_fee_id
WHERE sf.school_id <> r.school_id
UNION ALL
SELECT sf.school_id, sf.id, s.school_id
FROM public.student_fees sf JOIN public.students s ON s.id = sf.student_id
WHERE s.school_id <> sf.school_id;

\echo '8. Audit rows that look database-written but were appended by a non-admin through the API (possible forgeries before 0025)'
SELECT a.school_id, a.id AS audit_id, a.action, a.actor_id, a.created_at
FROM public.audit_logs a
WHERE strpos(a.action, '.db_') > 0
  AND a.metadata ->> 'via' = 'api_user'
  AND NOT EXISTS (
    SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE u.id = a.actor_id AND u.school_id = a.school_id AND ur.role = 'SCHOOL_ADMIN')
ORDER BY a.created_at;

\echo '9. Summary'
SELECT
  (SELECT count(*) FROM public.fee_payment_records) AS payments,
  (SELECT count(*) FROM public.fee_payment_records WHERE verified_by IS NOT NULL) AS verified,
  (SELECT count(*) FROM public.fee_payment_records WHERE is_voided) AS voided,
  (SELECT count(*) FROM public.student_fees) AS assignments,
  (SELECT count(*) FROM public.audit_logs) AS audit_rows;

ROLLBACK;
