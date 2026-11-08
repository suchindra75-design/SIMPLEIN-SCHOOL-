import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
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
} from "./razorpay";

const config = { keyId: "rzp_test_abc", keySecret: "key_secret_xyz", webhookSecret: "hook_secret_123" };
const hmac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

describe("getRazorpayConfig", () => {
  it("is null unless all three values are set", () => {
    expect(getRazorpayConfig({})).toBeNull();
    expect(getRazorpayConfig({ RAZORPAY_KEY_ID: "a", RAZORPAY_KEY_SECRET: "b" })).toBeNull();
    expect(getRazorpayConfig({ RAZORPAY_KEY_ID: "a", RAZORPAY_KEY_SECRET: "b", RAZORPAY_WEBHOOK_SECRET: " " })).toBeNull();
    expect(
      getRazorpayConfig({ RAZORPAY_KEY_ID: " a ", RAZORPAY_KEY_SECRET: "b", RAZORPAY_WEBHOOK_SECRET: "c" }),
    ).toEqual({ keyId: "a", keySecret: "b", webhookSecret: "c" });
  });
});

describe("verifyCheckoutSignature", () => {
  const good = hmac(config.keySecret, "order_1|pay_1");
  it("accepts the signature Razorpay computes", () => {
    expect(verifyCheckoutSignature(config, "order_1", "pay_1", good)).toBe(true);
    expect(verifyCheckoutSignature(config, "order_1", "pay_1", good.toUpperCase())).toBe(true);
  });
  it("rejects a signature for another order or payment", () => {
    expect(verifyCheckoutSignature(config, "order_2", "pay_1", good)).toBe(false);
    expect(verifyCheckoutSignature(config, "order_1", "pay_2", good)).toBe(false);
  });
  it("rejects a signature made with another secret, truncated or non-hex input", () => {
    expect(verifyCheckoutSignature(config, "order_1", "pay_1", hmac("other", "order_1|pay_1"))).toBe(false);
    expect(verifyCheckoutSignature(config, "order_1", "pay_1", good.slice(0, 32))).toBe(false);
    expect(verifyCheckoutSignature(config, "order_1", "pay_1", "zz" + good.slice(2))).toBe(false);
    expect(verifyCheckoutSignature(config, "order_1", "pay_1", "")).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"event":"payment.captured"}';
  it("accepts an HMAC of the raw body with the webhook secret", () => {
    expect(verifyWebhookSignature(config, body, hmac(config.webhookSecret, body))).toBe(true);
  });
  it("rejects a missing signature, the key secret, or a changed body", () => {
    expect(verifyWebhookSignature(config, body, null)).toBe(false);
    expect(verifyWebhookSignature(config, body, hmac(config.keySecret, body))).toBe(false);
    expect(verifyWebhookSignature(config, body + " ", hmac(config.webhookSecret, body))).toBe(false);
  });
});

describe("toPaise", () => {
  it("converts rupees to whole paise without float drift", () => {
    expect(toPaise(1)).toBe(100);
    expect(toPaise(1234.56)).toBe(123456);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit }[] = []): FetchLike {
  return async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

describe("createGatewayOrder", () => {
  it("posts amount in paise with basic auth and returns the order", async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const order = await createGatewayOrder(
      config,
      { amountPaise: 1500000, receipt: "fee_x", notes: { a: "b" } },
      fakeFetch(200, { id: "order_ABC", amount: 1500000, currency: "INR", status: "created" }, seen),
    );
    expect(order).toEqual({ id: "order_ABC", amount: 1500000, currency: "INR", status: "created" });
    expect(seen[0]?.url).toBe("https://api.razorpay.com/v1/orders");
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Basic ${Buffer.from("rzp_test_abc:key_secret_xyz").toString("base64")}`);
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      amount: 1500000,
      currency: "INR",
      receipt: "fee_x",
      notes: { a: "b" },
    });
  });
  it("refuses amounts under ₹1 and surfaces gateway errors without details", async () => {
    await expect(
      createGatewayOrder(config, { amountPaise: 99, receipt: "r", notes: {} }, fakeFetch(200, {})),
    ).rejects.toBeInstanceOf(GatewayError);
    await expect(
      createGatewayOrder(config, { amountPaise: 100, receipt: "r", notes: {} }, fakeFetch(401, { error: { description: "secret detail" } })),
    ).rejects.toThrow("could not start");
  });
  it("rejects a response whose amount differs from the request", async () => {
    await expect(
      createGatewayOrder(config, { amountPaise: 100, receipt: "r", notes: {} }, fakeFetch(200, { id: "order_1", amount: 200 })),
    ).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("fetchGatewayPayment / parsePaymentEntity", () => {
  it("parses a payment", async () => {
    const p = await fetchGatewayPayment(
      config,
      "pay_ABC123",
      fakeFetch(200, { id: "pay_ABC123", order_id: "order_1", amount: 500, currency: "INR", status: "captured", method: "upi", created_at: 1700000000 }),
    );
    expect(p).toEqual({ id: "pay_ABC123", orderId: "order_1", amount: 500, currency: "INR", status: "captured", method: "upi", createdAt: 1700000000 });
  });
  it("refuses ids that are not Razorpay payment ids (no path injection)", async () => {
    await expect(fetchGatewayPayment(config, "../orders", fakeFetch(200, {}))).rejects.toBeInstanceOf(GatewayError);
  });
  it("returns null for malformed entities", () => {
    expect(parsePaymentEntity(null)).toBeNull();
    expect(parsePaymentEntity({ id: 1, amount: 5 })).toBeNull();
    expect(parsePaymentEntity({ id: "pay_1", amount: "5" })).toBeNull();
  });
});
