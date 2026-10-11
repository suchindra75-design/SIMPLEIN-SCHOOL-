"use client";

import React, { useState, useEffect } from "react";
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";

interface AsyncStateWrapperProps {
  children: React.ReactNode;
  loadingDelayMs?: number;
  initialError?: boolean;
}

export function AsyncStateWrapper({
  children,
  loadingDelayMs = 100,
  initialError = false,
}: AsyncStateWrapperProps) {
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState(initialError);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, loadingDelayMs);
    return () => clearTimeout(timer);
  }, [loadingDelayMs]);

  const handleRetry = () => {
    setLoading(true);
    setLocalError(false);
    setTimeout(() => {
      setLoading(false);
    }, 200);
  };

  if (loading) {
    return (
      <div className="min-h-[200px] w-full flex flex-col items-center justify-center p-8 bg-white rounded-lg border border-zinc-200">
        <Loader2 className="w-5 h-5 text-zinc-900 animate-spin mb-2 stroke-[2]" />
        <p className="text-[11px] font-mono font-medium text-zinc-500 tracking-wider uppercase">
          Synchronizing Records...
        </p>
      </div>
    );
  }

  if (localError) {
    return (
      <div className="min-h-[200px] w-full flex flex-col items-center justify-center p-8 bg-zinc-50 rounded-lg border border-zinc-200 text-center">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-zinc-900 mb-3 border border-zinc-300">
          <AlertCircle className="w-5 h-5 stroke-[1.5]" />
        </div>
        <h3 className="text-sm font-bold text-zinc-950 mb-1">
          Operational Resynchronization Required
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed font-mono">
          Unable to fetch latest updates. Click below to retry.
        </p>
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs font-mono"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
