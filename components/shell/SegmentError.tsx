"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { retryAfterRefresh } from "./retry";

interface SegmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  home: string;
}

/**
 * Error boundary content rendered inside the portal shell, so navigation stays
 * available. Never shows raw error messages; the digest helps correlate logs.
 */
export function SegmentError({ error, reset, home }: SegmentErrorProps) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = () => retryAfterRefresh(startTransition, () => router.refresh(), reset);

  return (
    <div role="alert" className="ui-card mx-auto mt-4 max-w-lg animate-fade-in p-8 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <TriangleAlert aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-foreground">We couldn&apos;t load this page</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Something went wrong while loading this section. Try again, or go back to your dashboard.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={retry} disabled={retrying} className="ui-btn ui-btn-primary">
          <RefreshCw aria-hidden="true" className={retrying ? "size-4 animate-spin" : "size-4"} />
          {retrying ? "Retrying…" : "Try again"}
        </button>
        <Link href={home} className="ui-btn ui-btn-secondary">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
