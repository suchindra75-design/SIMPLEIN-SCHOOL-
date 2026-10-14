"use client";

import { SegmentError } from "@/components/shell/SegmentError";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} home="/student" />;
}
