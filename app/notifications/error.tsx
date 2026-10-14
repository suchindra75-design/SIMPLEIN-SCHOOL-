"use client";

import { SegmentError } from "@/components/shell/SegmentError";

export default function NotificationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} home="/login" />;
}
