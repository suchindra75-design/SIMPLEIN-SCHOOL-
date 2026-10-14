"use client";

import React, { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/shell/StatusScreen";
import { retryAfterRefresh } from "@/components/shell/retry";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      icon={TriangleAlert}
      eyebrow="Something went wrong"
      title="We couldn't load this page"
      description={
        <>
          An unexpected error occurred. Please try again.
          {error.digest ? (
            <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
          ) : null}
        </>
      }
    >
      <button
        type="button"
        onClick={() => retryAfterRefresh(startTransition, () => router.refresh(), reset)}
        disabled={retrying}
        className="ui-btn ui-btn-primary"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {retrying ? "Retrying…" : "Try again"}
      </button>
      <Link href="/login" className="ui-btn ui-btn-secondary">
        Go to my dashboard
      </Link>
    </StatusScreen>
  );
}
