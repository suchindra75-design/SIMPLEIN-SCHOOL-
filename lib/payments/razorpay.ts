import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay gateway adapter (server-only). UPI is offered through Razorpay
 * Checkout; the money goes to the merchant account whose keys are configured.
 *
 * Trust model:
 * - The browser's success callback is NOT trusted on its own. A payment
 *   counts only after (1) its signature verifies with the key secret or the
 *   webhook secret, and (2) the server fetches it from the Razorpay API and
 *   sees status "captured" for the expected order and amount.
 * - Secrets are read from server env only and never returned or logged.
 *
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 */

const API_BASE = "https://api.razorpay.com/v1";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/** Null when the gateway is not configured (online payment then stays off). */
export function getRazorpayConfig(
  env: Record<string, string | undefined> = process.env,
): RazorpayConfig | null {
  const keyId = env["RAZORPAY_KEY_ID"];
  const keySecret = env["RAZORPAY_KEY_SECRET"];
  const webhookSecret = env["RAZORPAY_WEBHOOK_SECRET"];
  if (!isSet(keyId) || !isSet(keySecret) || !isSet(webhookSecret)) return null;
  return { keyId: keyId.trim(), keySecret: keySecret.trim(), webhookSecret: webhookSecret.trim() };
}

export class GatewayError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

/** Constant-time compare of two hex HMAC strings. */
function safeEqualHex(expected: string, received: string): boolean {
  if (!/^[0-9a-f]+$/i.test(received)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** Checkout success signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(
  config: Pick<RazorpayConfig, "keySecret">,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  return safeEqualHex(hmacHex(config.keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(
  config: Pick<RazorpayConfig, "webhookSecret">,
  rawBody: string,
  signature: string | null,
): boolean {
  if (signature === null || signature === "") return false;
  return safeEqualHex(hmacHex(config.webhookSecret, rawBody), signature);
}

/** Rupees (2 dp) → integer paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
}

export interface GatewayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amount: number; // paise
  currency: string;
  status: string; // created | authorized | captured | refunded | failed
  method: string | null;
  createdAt: number | null; // unix seconds
}

/** POST /v1/orders. `receipt` is our order reference (max 40 chars). */
export async function createGatewayOrder(
  config: RazorpayConfig,
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
  fetchImpl: FetchLike = fetch,
): Promise<GatewayOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    throw new GatewayError("Amount must be at least ₹1");
  }
  const res = await fetchImpl(`${API_BASE}/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GatewayError("The payment gateway could not start this payment", res.status);
  }
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body["id"] !== "string" || body["amount"] !== input.amountPaise) {
    throw new GatewayError("Unexpected response from the payment gateway");
  }
  return {
    id: body["id"],
    amount: body["amount"] as number,
    currency: String(body["currency"] ?? "INR"),
    status: String(body["status"] ?? ""),
  };
}

/** Normalises a Razorpay payment entity (API response or webhook payload). */
export function parsePaymentEntity(entity: unknown): GatewayPayment | null {
  if (entity === null || typeof entity !== "object") return null;
  const e = entity as Record<string, unknown>;
  if (typeof e["id"] !== "string" || typeof e["amount"] !== "number") return null;
  return {
    id: e["id"],
    orderId: typeof e["order_id"] === "string" ? e["order_id"] : null,
    amount: e["amount"],
    currency: String(e["currency"] ?? ""),
    status: String(e["status"] ?? ""),
    method: typeof e["method"] === "string" ? e["method"] : null,
    createdAt: typeof e["created_at"] === "number" ? e["created_at"] : null,
  };
}

/** GET /v1/payments/:id — the authoritative status of a payment. */
export async function fetchGatewayPayment(
  config: RazorpayConfig,
  paymentId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GatewayPayment> {
  if (!/^pay_[A-Za-z0-9]{1,40}$/.test(paymentId)) {
    throw new GatewayError("Invalid payment reference");
  }
  const res = await fetchImpl(`${API_BASE}/payments/${paymentId}`, {
    method: "GET",
    headers: { Authorization: authHeader(config) },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GatewayError("The payment gateway could not confirm this payment", res.status);
  }
  const parsed = parsePaymentEntity(await res.json());
  if (parsed === null) throw new GatewayError("Unexpected response from the payment gateway");
  return parsed;
}
