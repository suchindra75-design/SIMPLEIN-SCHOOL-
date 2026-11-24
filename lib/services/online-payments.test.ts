import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError, TenantBoundaryError } from "@/lib/auth/session";
import { ConflictError, NotFoundError, type DbClient } from "@/lib/services/errors";
import { createFakeDb, type FakeDb, type Row } from "@/lib/test/fake-db";
import type { FetchLike } from "@/lib/payments/razorpay";
import { isConfirmedRecord, listStudentFees, verifyPaymentRecord } from "@/lib/services/fees";
import {
  confirmCheckoutPayment,
  createPaymentOrder,
  handleRazorpayWebhook,
  onlinePaymentsAvailable,
  type OnlinePaymentDeps,
} from "@/lib/services/online-payments";

/**
 * Online (UPI) fee payments, server side. The gateway is a fake fetch; the
 * settlement function is a recorded fake RPC (its SQL behaviour — locking,
 * idempotency, overpay → REVIEW — lives in migration 0028 and is exercised by
 * supabase/tests/online_fee_payments.sql).
 */

const A = "school-a";
const B = "school-b";
const config = { keyId: "rzp_test_k", keySecret: "ks", webhookSecret: "ws" };
const sign = (secret: string, s: string) => createHmac("sha256", secret).update(s).digest("hex");

function ctxFor(roles: SessionContext["roles"], userId: string, schoolId = A): SessionContext {
  return {
    authUserId: `auth-${userId}`,
    profile: {
      id: userId,
      authUserId: `auth-${userId}`,
      schoolId,
      email: `${userId}@example.com`,
      fullName: userId,
      phone: "9876500301",
      isActive: true,
    },
    school: {
      id: schoolId,
      name: "Green Park School",
      slug: "gps",
      timezone: "Asia/Kolkata",
      logoPath: null,
      primaryColor: null,
      isActive: true,
    },
    roles,
  };
}

const parent = () => ctxFor(["PARENT"], "u-parent");
const otherParent = () => ctxFor(["PARENT"], "u-parent2");
const student = () => ctxFor(["STUDENT"], "u-student");
const admin = () => ctxFor(["SCHOOL_ADMIN"], "u-admin");
const teacher = () => ctxFor(["TEACHER"], "u-teacher");

function seed(): Record<string, Row[]> {
  return {
    schools: [
      { id: A, name: "Green Park School", online_payments_enabled: true },
      { id: B, name: "Other", online_payments_enabled: true },
    ],
    parents: [
      { id: "p1", school_id: A, user_id: "u-parent", is_active: true },
      { id: "p2", school_id: A, user_id: "u-parent2", is_active: true },
    ],
    student_parents: [{ student_id: "s1", parent_id: "p1" }],
    students: [
      { id: "s1", school_id: A, user_id: "u-student", status: "active", admission_no: "A1", display_name: "Aarav" },
      { id: "s2", school_id: A, status: "active", admission_no: "A2", display_name: "Diya" },
    ],
    student_fees: [
      {
        id: "sf1", school_id: A, student_id: "s1", fee_structure_id: "fs1", total_amount: 15000, due_date: null,
        fee_structures: { name: "Term 1" }, students: { display_name: "Aarav", admission_no: "A1" },
      },
      {
        id: "sf2", school_id: A, student_id: "s2", fee_structure_id: "fs1", total_amount: 15000, due_date: null,
        fee_structures: { name: "Term 1" }, students: { display_name: "Diya", admission_no: "A2" },
      },
    ],
    fee_payment_records: [],
    fee_payment_orders: [],
  };
}

interface Harness {
  db: FakeDb;
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  rpcResult: { status: string; payment_record_id: string | null };
  gatewaySeen: { url?: string; body?: unknown }[];
  gatewayPayment: Record<string, unknown>;
  deps: OnlinePaymentDeps;
}

function harness(): Harness {
  const h = {
    db: createFakeDb(seed()),
    rpcCalls: [],
    rpcResult: { status: "PAID", payment_record_id: "rec-1" },
    gatewaySeen: [],
    gatewayPayment: { id: "pay_X1", order_id: "order_G1", amount: 1500000, currency: "INR", status: "captured", method: "upi", created_at: 1762560000 },
  } as unknown as Harness;
  const fetchImpl: FetchLike = async (url, init) => {
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    h.gatewaySeen.push({ url, body });
    if (url.endsWith("/orders")) {
      const amount = (body as { amount: number }).amount;
      return new Response(JSON.stringify({ id: "order_G1", amount, currency: "INR", status: "created" }), { status: 200 });
    }
    return new Response(JSON.stringify(h.gatewayPayment), { status: 200 });
  };
  const adminDb = () =>
    ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        return { data: fn === "settle_fee_payment_order" ? [h.rpcResult] : null, error: null };
      },
    }) as unknown as DbClient;
  h.deps = { config, fetchImpl, adminDb };
  return h;
}

let h: Harness;
beforeEach(() => {
  h = harness();
});
const db = () => h.db as unknown as DbClient;

describe("onlinePaymentsAvailable", () => {
  it("needs both gateway keys and the school switch", async () => {
    expect(await onlinePaymentsAvailable(db(), parent(), h.deps)).toBe(true);
    expect(await onlinePaymentsAvailable(db(), parent(), { ...h.deps, config: null })).toBe(false);
    (h.db.seed["schools"] as Row[])[0]!["online_payments_enabled"] = false;
    expect(await onlinePaymentsAvailable(db(), parent(), h.deps)).toBe(false);
  });
});

describe("createPaymentOrder", () => {
  it("creates a gateway order for the full outstanding amount and stores it in the payer's name", async () => {
    const session = await createPaymentOrder(db(), parent(), { studentFeeId: "sf1" }, h.deps);
    expect(session).toMatchObject({ gatewayOrderId: "order_G1", keyId: "rzp_test_k", amount: 15000, amountPaise: 1500000, currency: "INR" });
    expect(session.description).toBe("Term 1 · Aarav");
    const insert = h.db.callsTo("fee_payment_orders", "insert")[0]!;
    expect(insert.payload).toMatchObject({
      school_id: A, student_fee_id: "sf1", amount: 15000, gateway_order_id: "order_G1", status: "CREATED", initiated_by: "u-parent",
    });
    // The key secret never leaves the server.
    expect(JSON.stringify(session)).not.toContain("ks");
  });

  it("lets a student pay their own fee", async () => {
    const session = await createPaymentOrder(db(), student(), { studentFeeId: "sf1" }, h.deps);
    expect(session.amount).toBe(15000);
  });

  it("subtracts every non-voided record, including ones awaiting verification", async () => {
    h.db.seed["fee_payment_records"] = [
      { id: "r1", school_id: A, student_fee_id: "sf1", amount: 5000, is_voided: false, verified_by: "u-admin2" },
      { id: "r2", school_id: A, student_fee_id: "sf1", amount: 2000, is_voided: false, verified_by: null },
      { id: "r3", school_id: A, student_fee_id: "sf1", amount: 9000, is_voided: true, verified_by: null },
    ];
    const session = await createPaymentOrder(db(), parent(), { studentFeeId: "sf1" }, h.deps);
    expect(session.amount).toBe(8000);
    await expect(createPaymentOrder(db(), parent(), { studentFeeId: "sf1", amount: 8001 }, h.deps)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses when nothing is due, or the amount is under ₹1", async () => {
    h.db.seed["fee_payment_records"] = [
      { id: "r1", school_id: A, student_fee_id: "sf1", amount: 15000, is_voided: false, verified_by: "u-admin2" },
    ];
    await expect(createPaymentOrder(db(), parent(), { studentFeeId: "sf1" }, h.deps)).rejects.toThrow(/Nothing is due/);
    h.db.seed["fee_payment_records"] = [];
    await expect(createPaymentOrder(db(), parent(), { studentFeeId: "sf1", amount: 0.5 }, h.deps)).rejects.toThrow(/at least/);
    expect(h.gatewaySeen).toHaveLength(0);
  });

  it("keeps parents to linked children and students to their own fees (no gateway call)", async () => {
    await expect(createPaymentOrder(db(), otherParent(), { studentFeeId: "sf1" }, h.deps)).rejects.toBeInstanceOf(TenantBoundaryError);
    await expect(createPaymentOrder(db(), parent(), { studentFeeId: "sf2" }, h.deps)).rejects.toBeInstanceOf(TenantBoundaryError);
    await expect(createPaymentOrder(db(), student(), { studentFeeId: "sf2" }, h.deps)).rejects.toBeInstanceOf(TenantBoundaryError);
    await expect(createPaymentOrder(db(), ctxFor(["PARENT"], "u-parent", B), { studentFeeId: "sf1" }, h.deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(h.gatewaySeen).toHaveLength(0);
  });

  it("is not for staff", async () => {
    await expect(createPaymentOrder(db(), admin(), { studentFeeId: "sf1" }, h.deps)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPaymentOrder(db(), teacher(), { studentFeeId: "sf1" }, h.deps)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is refused when the gateway is not configured or the school has it off", async () => {
    await expect(createPaymentOrder(db(), parent(), { studentFeeId: "sf1" }, { ...h.deps, config: null })).rejects.toThrow(/not available/);
    (h.db.seed["schools"] as Row[])[0]!["online_payments_enabled"] = false;
    await expect(createPaymentOrder(db(), parent(), { studentFeeId: "sf1" }, h.deps)).rejects.toThrow(/not enabled/);
    expect(h.gatewaySeen).toHaveLength(0);
  });
});

describe("confirmCheckoutPayment", () => {
  const goodInput = () => ({
    gatewayOrderId: "order_G1",
    gatewayPaymentId: "pay_X1",
    signature: sign(config.keySecret, "order_G1|pay_X1"),
  });
  beforeEach(() => {
    h.db.seed["fee_payment_orders"] = [
      { id: "o1", school_id: A, student_fee_id: "sf1", amount: 15000, gateway_order_id: "order_G1", status: "CREATED", initiated_by: "u-parent" },
    ];
  });

  it("settles a captured payment after checking the signature and fetching it from the gateway", async () => {
    expect(await confirmCheckoutPayment(db(), parent(), goodInput(), h.deps)).toEqual({ status: "PAID" });
    expect(h.gatewaySeen[0]?.url).toBe("https://api.razorpay.com/v1/payments/pay_X1");
    expect(h.rpcCalls).toEqual([
      {
        fn: "settle_fee_payment_order",
        args: { p_gateway_order_id: "order_G1", p_gateway_payment_id: "pay_X1", p_amount_paise: 1500000, p_paid_at: new Date(1762560000 * 1000).toISOString() },
      },
    ]);
  });

  it("rejects a forged signature without touching the gateway or the database", async () => {
    await expect(
      confirmCheckoutPayment(db(), parent(), { ...goodInput(), signature: sign("wrong", "order_G1|pay_X1") }, h.deps),
    ).rejects.toThrow(/could not be verified/);
    expect(h.gatewaySeen).toHaveLength(0);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("only the person who started the order can confirm it", async () => {
    await expect(confirmCheckoutPayment(db(), otherParent(), goodInput(), h.deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("refuses a payment that belongs to another order", async () => {
    h.gatewayPayment["order_id"] = "order_OTHER";
    await expect(confirmCheckoutPayment(db(), parent(), goodInput(), h.deps)).rejects.toThrow(/does not belong/);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("returns PROCESSING (no record) while the payment is only authorized", async () => {
    h.gatewayPayment["status"] = "authorized";
    expect(await confirmCheckoutPayment(db(), parent(), goodInput(), h.deps)).toEqual({ status: "PROCESSING" });
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("notes a failed payment and leaves the order open for a retry", async () => {
    h.gatewayPayment["status"] = "failed";
    await expect(confirmCheckoutPayment(db(), parent(), goodInput(), h.deps)).rejects.toThrow(/No money was taken/);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["note_fee_payment_order_failure"]);
  });

  it("is idempotent once the order is settled", async () => {
    (h.db.seed["fee_payment_orders"] as Row[])[0]!["status"] = "PAID";
    expect(await confirmCheckoutPayment(db(), parent(), goodInput(), h.deps)).toEqual({ status: "PAID" });
    expect(h.gatewaySeen).toHaveLength(0);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("passes through REVIEW from settlement (money taken, not applied)", async () => {
    h.rpcResult = { status: "REVIEW", payment_record_id: null };
    expect(await confirmCheckoutPayment(db(), parent(), goodInput(), h.deps)).toEqual({ status: "REVIEW" });
  });
});

describe("handleRazorpayWebhook", () => {
  const event = (name: string, payment: Record<string, unknown>) =>
    JSON.stringify({ event: name, payload: { payment: { entity: payment } } });
  const captured = { id: "pay_X1", order_id: "order_G1", amount: 1500000, currency: "INR", status: "captured", created_at: 1762560000 };

  it("settles payment.captured with a valid signature", async () => {
    const body = event("payment.captured", captured);
    const result = await handleRazorpayWebhook(body, sign(config.webhookSecret, body), h.deps);
    expect(result).toEqual({ ok: true, event: "payment.captured", status: "PAID" });
    expect(h.rpcCalls[0]?.args).toMatchObject({ p_gateway_order_id: "order_G1", p_gateway_payment_id: "pay_X1", p_amount_paise: 1500000 });
  });

  it("rejects an unsigned or tampered body", async () => {
    const body = event("payment.captured", captured);
    expect((await handleRazorpayWebhook(body, null, h.deps)).ok).toBe(false);
    expect((await handleRazorpayWebhook(body.replace("1500000", "1"), sign(config.webhookSecret, body), h.deps)).ok).toBe(false);
    expect((await handleRazorpayWebhook(body, sign(config.keySecret, body), h.deps)).ok).toBe(false);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("ignores events that are not a capture, and non-captured payments", async () => {
    const refund = JSON.stringify({ event: "refund.processed", payload: {} });
    expect(await handleRazorpayWebhook(refund, sign(config.webhookSecret, refund), h.deps)).toEqual({ ok: true, event: "refund.processed", status: "IGNORED" });
    const auth = event("payment.captured", { ...captured, status: "authorized" });
    expect((await handleRazorpayWebhook(auth, sign(config.webhookSecret, auth), h.deps)).status).toBe("IGNORED");
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("records failures without settling", async () => {
    const body = event("payment.failed", { ...captured, status: "failed" });
    await handleRazorpayWebhook(body, sign(config.webhookSecret, body), h.deps);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["note_fee_payment_order_failure"]);
  });

  it("does nothing when the gateway is not configured", async () => {
    const body = event("payment.captured", captured);
    expect((await handleRazorpayWebhook(body, "x", { ...h.deps, config: null })).ok).toBe(false);
  });
});

describe("fee views count gateway payments as paid", () => {
  it("isConfirmedRecord: second-admin verification or gateway capture", () => {
    expect(isConfirmedRecord({ verifiedBy: null, source: "GATEWAY" })).toBe(true);
    expect(isConfirmedRecord({ verifiedBy: "u-admin2", source: "STAFF" })).toBe(true);
    expect(isConfirmedRecord({ verifiedBy: null, source: "STAFF" })).toBe(false);
    expect(isConfirmedRecord({ verifiedBy: null })).toBe(false);
  });

  it("a gateway record makes the fee PAID without staff verification", async () => {
    h.db.seed["fee_payment_records"] = [
      { id: "g1", school_id: A, student_fee_id: "sf1", amount: 15000, paid_on: "2026-11-08", mode: "ONLINE", is_voided: false, verified_by: null, recorded_by: "u-parent", source: "GATEWAY", gateway_payment_id: "pay_X1" },
    ];
    const { fees } = await listStudentFees(db(), parent(), "s1");
    expect(fees[0]).toMatchObject({ paid: 15000, due: 0, status: "PAID" });
  });

  it("staff cannot 'verify' a gateway record", async () => {
    h.db.seed["fee_payment_records"] = [
      { id: "g1", school_id: A, student_fee_id: "sf1", amount: 15000, is_voided: false, verified_by: null, recorded_by: "u-parent", source: "GATEWAY" },
    ];
    await expect(verifyPaymentRecord(db(), admin(), "g1")).rejects.toThrow(/need no verification/);
  });
});
