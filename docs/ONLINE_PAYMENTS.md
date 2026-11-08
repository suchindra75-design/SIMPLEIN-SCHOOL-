# Online fee payments (UPI via Razorpay)

Parents (for linked children) and students (own fees) can pay a fee online from
**Fees → Pay ₹… with UPI**. Razorpay Checkout opens with UPI first (UPI apps,
QR, UPI ID); cards/netbanking stay available below it.

Off by default. It appears only when **all three keys are set** and the
**school is switched on**.

## How a payment is recorded

1. `POST /api/v1/payments/orders`: the server checks access and the
   outstanding balance, creates a Razorpay order, and stores a `CREATED` row in
   `fee_payment_orders` with the payer's own session (RLS + trigger).
2. Checkout succeeds → `POST /api/v1/payments/confirm`: the server checks the
   signature, **fetches the payment from Razorpay**, and settles only if it is
   `captured` for this order and amount.
3. `POST /api/v1/payments/razorpay/webhook` (signed): settles the same order
   independently, so a closed tab still records the payment.

Settlement is `public.settle_fee_payment_order` (service role only). It is
idempotent: one record per order and per Razorpay payment. It writes a
`fee_payment_records` row with `source = 'GATEWAY'`, `mode = 'ONLINE'`, in the
payer's name. Gateway records count as paid immediately: the signed,
server-checked capture takes the place of the second admin. Office payments
keep maker-checker unchanged.

**Money already taken never fails.** If a capture would overpay (the balance
changed after the payer started, e.g. cash recorded meanwhile, or two tabs),
or the amount differs, the order becomes **REVIEW**. Nothing is applied to the
fee. It shows on the admin Fees page under "Online payments needing review".
The school refunds it from the Razorpay dashboard.

Refunds are made in the Razorpay dashboard. Then another admin voids the
record in the ERP with a reason (this is audited).

Every order insert and status change writes a database audit row
(`fee_payment_order.db_*`), as does the payment record itself
(`fee_payment.db_recorded`, `via = service_role`).

## Owner setup (per environment)

1. **Razorpay account** (KYC done). Start with **Test mode** keys.
2. **Server env** (Vercel → Settings → Environment Variables; never `NEXT_PUBLIC_`):
   - `RAZORPAY_KEY_ID` (`rzp_test_…` / `rzp_live_…`)
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` (you choose it when creating the webhook)
3. **Webhook** (Razorpay → Settings → Webhooks):
   URL `https://<app domain>/api/v1/payments/razorpay/webhook`,
   events `payment.captured`, `order.paid`, `payment.failed`.
4. **Payment capture**: keep **automatic capture** on (Razorpay default).
   Payments that are only `authorized` stay "being confirmed" until they are
   captured.
5. **Apply migration 0028**, then switch the school on:
   ```sql
   UPDATE public.schools SET online_payments_enabled = true WHERE id = '<school uuid>';
   ```
6. **Test** with Razorpay test UPI (`success@razorpay` / `failure@razorpay`):
   pay part of a fee, check it shows as paid, check the webhook delivery log,
   then try a failed payment.

## Limits (V1)

- **One merchant account for the whole deployment.** Every school's online
  payments settle into the account whose keys are configured. If each school
  needs its own account, the next step is Razorpay Route or per-school keys.
- School admins can also change `online_payments_enabled` (they can update
  their own school row).
- No in-app refunds and no partial-amount picker in the UI. The API accepts an
  optional `amount`; the button pays everything still payable.
- The CSP (report-only) allows `checkout.razorpay.com`, `api.razorpay.com`
  and `lumberjack.razorpay.com`.

## Tests

- `lib/payments/razorpay.test.ts`: signatures, order and payment API handling.
- `lib/services/online-payments.test.ts`: scope, balance, confirm, webhook,
  idempotency, paid rule.
- `supabase/tests/online_fee_payments.sql` (pgTAP, 31): RLS, insert guard,
  forged gateway records, settlement idempotency, overpay → REVIEW, grants.
