"use client";

import { SegmentError } from "@/components/shell/SegmentError";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} home="/admin" />;
}
