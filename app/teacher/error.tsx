"use client";

import { SegmentError } from "@/components/shell/SegmentError";

export default function TeacherError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} home="/teacher" />;
}
