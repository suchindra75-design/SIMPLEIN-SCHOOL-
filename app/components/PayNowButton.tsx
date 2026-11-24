"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Pay Now (UPI first) through Razorpay Checkout. The server creates the order
 * and, after the payer finishes, verifies the signature and fetches the
 * payment from Razorpay before anything is recorded. Nothing here is trusted
 * on its own.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface CheckoutSession {
  gatewayOrderId: string;
  keyId: string;
  amount: number;
  amountPaise: number;
  currency: "INR";
  schoolName: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay !== undefined) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error("Could not load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loader;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!res.ok || json.data === undefined) {
    throw new Error(json.error?.message ?? "Something went wrong. Please try again.");
  }
  return json.data;
}

type Phase = "idle" | "starting" | "open" | "confirming" | "done";

export function PayNowButton({ studentFeeId, amountDue }: { studentFeeId: string; amountDue: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<{ kind: "ok" | "info" | "error"; text: string } | null>(null);

  const confirm = async (response: RazorpaySuccess) => {
    setPhase("confirming");
    try {
      const result = await postJson<{ status: "PAID" | "REVIEW" | "PROCESSING" }>("/api/v1/payments/confirm", {
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      });
      if (result.status === "PAID") {
        setMessage({ kind: "ok", text: "Payment received. Thank you!" });
      } else if (result.status === "PROCESSING") {
        setMessage({
          kind: "info",
          text: "Payment is being confirmed by the bank. This page will show it as paid within a few minutes.",
        });
      } else {
        setMessage({
          kind: "info",
          text: "Payment received, but the school needs to review it (the balance changed meanwhile). The school office will contact you.",
        });
      }
      setPhase("done");
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: `${error instanceof Error ? error.message : "Could not confirm the payment."} If money was debited, it will be confirmed automatically — do not pay again.`,
      });
      setPhase("done");
    }
  };

  const start = async () => {
    setMessage(null);
    setPhase("starting");
    try {
      const [session] = await Promise.all([
        postJson<CheckoutSession>("/api/v1/payments/orders", { studentFeeId }),
        loadCheckout(),
      ]);
      if (window.Razorpay === undefined) throw new Error("Could not load the payment window.");
      const checkout = new window.Razorpay({
        key: session.keyId,
        order_id: session.gatewayOrderId,
        amount: session.amountPaise,
        currency: session.currency,
        name: session.schoolName,
        description: session.description,
        prefill: session.prefill,
        theme: { color: "#2563eb" },
        // UPI first (apps, QR, UPI ID); other methods stay available below.
        config: {
          display: {
            blocks: {
              upi: { name: "Pay using UPI", instruments: [{ method: "upi" }] },
            },
            sequence: ["block.upi"],
            preferences: { show_default_blocks: true },
          },
        },
        handler: (response: RazorpaySuccess) => {
          void confirm(response);
        },
        modal: {
          ondismiss: () => setPhase((p) => (p === "open" ? "idle" : p)),
        },
      });
      checkout.on("payment.failed", (response) => {
        setMessage({
          kind: "error",
          text: response.error?.description ?? "The payment failed. No money was taken; you can try again.",
        });
      });
      setPhase("open");
      checkout.open();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not start the payment." });
      setPhase("idle");
    }
  };

  const busy = phase === "starting" || phase === "open" || phase === "confirming";
  return (
    <div className="mt-2">
      {phase !== "done" || message?.kind === "error" ? (
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => void start()} disabled={busy}>
          {phase === "starting"
            ? "Starting…"
            : phase === "confirming"
              ? "Confirming…"
              : `Pay ₹${amountDue.toLocaleString("en-IN")} with UPI`}
        </button>
      ) : null}
      {message !== null && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-1 text-xs ${
            message.kind === "ok" ? "text-green-700" : message.kind === "error" ? "text-red-700" : "text-gray-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
