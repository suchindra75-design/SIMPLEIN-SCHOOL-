import React from "react";

interface SkeletonProps {
  className?: string;
}

/**
 * Calm, subtle skeleton loading placeholder.
 * Uses neutral #E7E7E9 surface and gentle low-contrast pulse.
 * Automatically respects prefers-reduced-motion.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading..."
      className={`skeleton-calm rounded-md ${className}`}
    />
  );
}
