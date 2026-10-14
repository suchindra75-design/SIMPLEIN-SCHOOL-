"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/shell/StatusScreen";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
      <button type="button" onClick={() => reset()} className="ui-btn ui-btn-primary">
        <RotateCcw aria-hidden="true" className="size-4" />
        Try again
      </button>
      <Link href="/login" className="ui-btn ui-btn-secondary">
        Go to my dashboard
      </Link>
    </StatusScreen>
  );
}
