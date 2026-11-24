import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { assertStudentFeeAccess } from "@/lib/services/fees";
import {
  createGatewayOrder,
  fetchGatewayPayment,
  GatewayError,
  getRazorpayConfig,
  parsePaymentEntity,
  toPaise,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type FetchLike,
  type GatewayPayment,
  type RazorpayConfig,
} from "@/lib/payments/razorpay";

/**
 * Online fee payments (UPI through Razorpay Checkout), migration 0028.
 *
 * Flow:
 * 1. A parent (linked child) or student (own fee) asks to pay. The server
 *    checks scope + balance, creates a gateway order, and stores a CREATED
 *    fee_payment_orders row with the caller's own session (RLS + trigger).
 * 2. The browser opens Checkout (UPI first). On success it posts the
 *    payment id + signature back; the server verifies the signature, FETCHES
 *    the payment from Razorpay, and settles only when it is captured.
 * 3. The Razorpay webhook (signed) settles the same order independently, so
 *    a closed tab or lost network still records the payment. Settlement is
 *    idempotent (one record per order and per gateway payment).
 *
 * Settlement runs public.settle_fee_payment_order through the service-role
 * client: the one place a GATEWAY payment record is written. It is the only
 * service-role use in the fee module, and happens only after the gateway has
 * proven the capture (signature + API fetch, or signed webhook).
 */

export interface OnlinePaymentDeps {
  config?: RazorpayConfig | null;
  fetchImpl?: FetchLike;
  /** Service-role client factory (settlement only). */
  adminDb?: () => DbClient;
}

async function defaultAdminDb(): Promise<() => DbClient> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return () => createAdminClient() as unknown as DbClient;
}

function configFrom(deps: OnlinePaymentDeps): RazorpayConfig | null {
  return deps.config === undefined ? getRazorpayConfig() : deps.config;
}

/** Whether Pay Now should be offered to this caller's school. */
export async function onlinePaymentsAvailable(
  db: DbClient,
  ctx: SessionContext,
  deps: OnlinePaymentDeps = {},
): Promise<boolean> {
  if (configFrom(deps) === null) return false;
  const { data, error } = await db
    .from("schools")
    .select("online_payments_enabled")
    .eq("id", ctx.profile.schoolId)
    .single();
  if (error !== null || data === null) return false;
  return (data as { online_payments_enabled?: boolean }).online_payments_enabled === true;
}

export interface CheckoutSession {
  orderId: string;
  gatewayOrderId: string;
  keyId: string;
  amount: number;
  amountPaise: number;
  currency: "INR";
  schoolName: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

/** Outstanding = total − every non-voided record (confirmed or not), as recordPayment. */
async function outstandingFor(
  db: DbClient,
  ctx: SessionContext,
  studentFeeId: string,
  total: number,
): Promise<number> {
  const { data, error } = await db
    .from("fee_payment_records")
    .select("amount, is_voided")
    .eq("student_fee_id", studentFeeId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  const recorded = ((data ?? []) as { amount: number; is_voided: boolean }[])
    .filter((r) => !r.is_voided)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  return Math.max(0, Math.round((Number(total) - recorded) * 100) / 100);
}

/** Step 1: create a checkout for one fee (full outstanding unless an amount is given). */
export async function createPaymentOrder(
  db: DbClient,
  ctx: SessionContext,
  input: { studentFeeId: string; amount?: number | null },
  deps: OnlinePaymentDeps = {},
): Promise<CheckoutSession> {
  authorizeRoles(ctx, ["PARENT", "STUDENT"]);
  const config = configFrom(deps);
  if (config === null) {
    throw new ConflictError("Online payment is not available yet. Please pay at the school office.");
  }

  const { data: fee, error: feeError } = await db
    .from("student_fees")
    .select("id, student_id, total_amount, fee_structures(name), students(display_name, admission_no)")
    .eq("id", input.studentFeeId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(feeError, "Fee not found");
  const row = fee as unknown as {
    id: string;
    student_id: string;
    total_amount: number;
    fee_structures?: { name: string } | null;
    students?: { display_name: string; admission_no: string } | null;
  };
  await assertStudentFeeAccess(db, ctx, row.student_id);

  if (!(await onlinePaymentsAvailable(db, ctx, { config }))) {
    throw new ConflictError("Online payment is not enabled for this school. Please pay at the school office.");
  }

  const outstanding = await outstandingFor(db, ctx, row.id, row.total_amount);
  if (outstanding <= 0) {
    throw new ConflictError("Nothing is due on this fee (payments awaiting confirmation count too)");
  }
  const amount =
    input.amount === undefined || input.amount === null
      ? outstanding
      : Math.round(input.amount * 100) / 100;
  if (!(amount >= 1)) throw new ConflictError("Amount must be at least ₹1");
  if (amount > outstanding) {
    throw new ConflictError(`Amount exceeds the outstanding balance (${outstanding})`);
  }

  const structureName = row.fee_structures?.name ?? "School fee";
  const studentName = row.students?.display_name ?? "";
  let gatewayOrder;
  try {
    gatewayOrder = await createGatewayOrder(
      config,
      {
        amountPaise: toPaise(amount),
        receipt: `fee_${row.id.slice(0, 8)}_${Date.now().toString(36)}`,
        notes: {
          school_id: ctx.profile.schoolId,
          student_fee_id: row.id,
          admission_no: row.students?.admission_no ?? "",
        },
      },
      deps.fetchImpl,
    );
  } catch (error) {
    if (error instanceof GatewayError) throw new ConflictError(error.message);
    throw error;
  }

  const { data: order, error: orderError } = await db
    .from("fee_payment_orders")
    .insert({
      school_id: ctx.profile.schoolId,
      student_fee_id: row.id,
      amount,
      gateway: "RAZORPAY",
      gateway_order_id: gatewayOrder.id,
      status: "CREATED",
      initiated_by: ctx.profile.id,
    })
    .select("id")
    .single();
  throwForPostgrest(orderError);

  return {
    orderId: (order as { id: string }).id,
    gatewayOrderId: gatewayOrder.id,
    keyId: config.keyId,
    amount,
    amountPaise: gatewayOrder.amount,
    currency: "INR",
    schoolName: ctx.school.name,
    description: studentName === "" ? structureName : `${structureName} · ${studentName}`,
    prefill: {
      name: ctx.profile.fullName,
      email: ctx.profile.email,
      contact: ctx.profile.phone ?? "",
    },
  };
}

export type SettlementStatus = "PAID" | "REVIEW" | "PROCESSING" | "UNKNOWN_ORDER";

async function settle(
  deps: OnlinePaymentDeps,
  payment: GatewayPayment,
): Promise<{ status: SettlementStatus; paymentRecordId: string | null }> {
  if (payment.orderId === null) return { status: "UNKNOWN_ORDER", paymentRecordId: null };
  const admin = (deps.adminDb ?? (await defaultAdminDb()))();
  const { data, error } = await admin.rpc("settle_fee_payment_order", {
    p_gateway_order_id: payment.orderId,
    p_gateway_payment_id: payment.id,
    p_amount_paise: payment.amount,
    p_paid_at:
      payment.createdAt === null ? new Date().toISOString() : new Date(payment.createdAt * 1000).toISOString(),
  });
  throwForPostgrest(error);
  const first = (Array.isArray(data) ? data[0] : data) as
    | { status: SettlementStatus; payment_record_id: string | null }
    | undefined;
  return {
    status: first?.status ?? "UNKNOWN_ORDER",
    paymentRecordId: first?.payment_record_id ?? null,
  };
}

async function noteFailure(deps: OnlinePaymentDeps, gatewayOrderId: string, reason: string): Promise<void> {
  const admin = (deps.adminDb ?? (await defaultAdminDb()))();
  const { error } = await admin.rpc("note_fee_payment_order_failure", {
    p_gateway_order_id: gatewayOrderId,
    p_reason: reason,
  });
  throwForPostgrest(error);
}

/** Step 2: the browser reports success; trust it only after the gateway confirms. */
export async function confirmCheckoutPayment(
  db: DbClient,
  ctx: SessionContext,
  input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string },
  deps: OnlinePaymentDeps = {},
): Promise<{ status: Exclude<SettlementStatus, "UNKNOWN_ORDER"> }> {
  authorizeRoles(ctx, ["PARENT", "STUDENT"]);
  const config = configFrom(deps);
  if (config === null) throw new ConflictError("Online payment is not available");

  if (!verifyCheckoutSignature(config, input.gatewayOrderId, input.gatewayPaymentId, input.signature)) {
    throw new ConflictError("This payment could not be verified");
  }
  // The caller must own the order (RLS: initiated_by = caller, own school).
  const { data: order, error } = await db
    .from("fee_payment_orders")
    .select("id, status, amount")
    .eq("gateway_order_id", input.gatewayOrderId)
    .eq("school_id", ctx.profile.schoolId)
    .eq("initiated_by", ctx.profile.id)
    .single();
  throwForPostgrest(error, "Payment not found");
  const own = order as { id: string; status: string; amount: number };
  if (own.status === "PAID" || own.status === "REVIEW") {
    return { status: own.status };
  }

  let payment: GatewayPayment;
  try {
    payment = await fetchGatewayPayment(config, input.gatewayPaymentId, deps.fetchImpl);
  } catch (err) {
    if (err instanceof GatewayError) {
      // Signature was valid: the webhook will settle it if it was captured.
      return { status: "PROCESSING" };
    }
    throw err;
  }
  if (payment.orderId !== input.gatewayOrderId || payment.currency !== "INR") {
    throw new ConflictError("This payment does not belong to this order");
  }
  if (payment.status === "captured") {
    const result = await settle(deps, payment);
    if (result.status === "UNKNOWN_ORDER") throw new NotFoundError("Payment not found");
    return { status: result.status };
  }
  if (payment.status === "failed") {
    await noteFailure(deps, input.gatewayOrderId, "Payment failed at the gateway");
    throw new ConflictError("The payment failed. No money was taken; you can try again.");
  }
  // created / authorized: capture is pending; the webhook settles it.
  return { status: "PROCESSING" };
}

/** Step 3: Razorpay webhook. Returns what happened (for logs); never throws on unknown events. */
export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null,
  deps: OnlinePaymentDeps = {},
): Promise<{ ok: boolean; event: string | null; status: SettlementStatus | "IGNORED" | null }> {
  const config = configFrom(deps);
  if (config === null) return { ok: false, event: null, status: null };
  if (!verifyWebhookSignature(config, rawBody, signature)) {
    return { ok: false, event: null, status: null };
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, event: null, status: null };
  }
  const event = typeof body["event"] === "string" ? body["event"] : null;
  const payload = (body["payload"] ?? {}) as Record<string, { entity?: unknown } | undefined>;
  const payment = parsePaymentEntity(payload["payment"]?.entity);

  if ((event === "payment.captured" || event === "order.paid") && payment !== null) {
    if (payment.status !== "captured" || payment.currency !== "INR") {
      return { ok: true, event, status: "IGNORED" };
    }
    const result = await settle(deps, payment);
    return { ok: true, event, status: result.status };
  }
  if (event === "payment.failed" && payment !== null && payment.orderId !== null) {
    await noteFailure(deps, payment.orderId, "Payment failed at the gateway");
    return { ok: true, event, status: "IGNORED" };
  }
  return { ok: true, event, status: "IGNORED" };
}

export interface PaymentOrderDto {
  id: string;
  studentFeeId: string;
  amount: number;
  status: "CREATED" | "PAID" | "REVIEW";
  gatewayOrderId: string;
  gatewayPaymentId: string | null;
  lastError: string | null;
  paidAt: string | null;
  createdAt: string;
  studentName: string | null;
  admissionNo: string | null;
  feeName: string | null;
}

/** Admin: online payments that need a person (refund or adjust), newest first. */
export async function listPaymentOrdersForReview(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ orders: PaymentOrderDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("fee_payment_orders")
    .select(
      "id, student_fee_id, amount, status, gateway_order_id, gateway_payment_id, last_error, paid_at, created_at, student_fees(fee_structures(name), students(display_name, admission_no))",
    )
    .eq("school_id", ctx.profile.schoolId)
    .eq("status", "REVIEW")
    .order("created_at", { ascending: false })
    .limit(100);
  throwForPostgrest(error);
  const rows = (data ?? []) as unknown as {
    id: string;
    student_fee_id: string;
    amount: number;
    status: PaymentOrderDto["status"];
    gateway_order_id: string;
    gateway_payment_id: string | null;
    last_error: string | null;
    paid_at: string | null;
    created_at: string;
    student_fees?: {
      fee_structures?: { name: string } | null;
      students?: { display_name: string; admission_no: string } | null;
    } | null;
  }[];
  return {
    orders: rows.map((r) => ({
      id: r.id,
      studentFeeId: r.student_fee_id,
      amount: Number(r.amount),
      status: r.status,
      gatewayOrderId: r.gateway_order_id,
      gatewayPaymentId: r.gateway_payment_id,
      lastError: r.last_error,
      paidAt: r.paid_at,
      createdAt: r.created_at,
      studentName: r.student_fees?.students?.display_name ?? null,
      admissionNo: r.student_fees?.students?.admission_no ?? null,
      feeName: r.student_fees?.fee_structures?.name ?? null,
    })),
  };
}
