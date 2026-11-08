import { NextResponse } from "next/server";
import { logServerError, newReference } from "@/lib/errors/server-log";
import { handleRazorpayWebhook } from "@/lib/services/online-payments";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Razorpay webhook (events: payment.captured, order.paid, payment.failed).
 * No session: authenticity is the X-Razorpay-Signature HMAC over the raw body.
 * Settlement is idempotent, so Razorpay's retries are safe. A 5xx makes
 * Razorpay retry; a bad signature gets 400 and is not retried.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Too large" } }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Too large" } }, { status: 413 });
  }
  try {
    const result = await handleRazorpayWebhook(rawBody, request.headers.get("x-razorpay-signature"));
    if (!result.ok) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid webhook" } }, { status: 400 });
    }
    return NextResponse.json({ data: { received: true } });
  } catch (error) {
    logServerError("razorpay_webhook", error, newReference());
    return NextResponse.json({ error: { code: "INTERNAL", message: "Try again" } }, { status: 500 });
  }
}
