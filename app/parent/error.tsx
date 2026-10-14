"use client";

import { SegmentError } from "@/components/shell/SegmentError";

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} home="/parent" />;
}
