import React from "react";

interface SkeletonProps {
  className?: string;
}

/** Shimmer placeholder; animation is disabled under prefers-reduced-motion. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`ui-skeleton ${className}`} />;
}
