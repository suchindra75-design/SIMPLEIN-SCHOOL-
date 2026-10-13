"use client";

import React, { useState } from "react";
import { useMockStore } from "@/lib/mock-store";
import { RotateCcw, Check, Disc, AlertCircle } from "lucide-react";

export function PrototypeBanner() {
  const { resetDemoData, simulatedErrorMode, toggleSimulatedError } = useMockStore();
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = () => {
    setResetting(true);
    setTimeout(() => {
      resetDemoData();
      setResetting(false);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    }, 250);
  };

  return (
    <div className="bg-zinc-950 text-zinc-300 text-xs py-1.5 px-4 flex items-center justify-between border-b border-zinc-800 z-50 select-none">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 text-zinc-200 font-mono text-[10px] uppercase tracking-wider border border-zinc-800">
          <Disc className="w-2.5 h-2.5 text-zinc-400" />
          Interactive Prototype
        </span>
        <span className="hidden sm:inline text-zinc-400 text-[11px] font-mono">
          Session memory only • Real-time mock data
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={() => toggleSimulatedError()}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors text-[11px] font-medium font-mono ${
            simulatedErrorMode
              ? "bg-white text-zinc-950 border-white font-bold"
              : "text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border-zinc-800"
          }`}
          title="Toggle mock error path to demonstrate resilience"
        >
          <AlertCircle className="w-3 h-3" />
          {simulatedErrorMode ? "Clear Error Mode" : "Simulate Error State"}
        </button>

        <button
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors text-[11px] font-medium font-mono disabled:opacity-50"
          title="Reset all demo data back to clean factory state"
        >
          {done ? (
            <>
              <Check className="w-3 h-3 text-white" />
              Reset Completed
            </>
          ) : (
            <>
              <RotateCcw className={`w-3 h-3 ${resetting ? "animate-spin" : ""}`} />
              Reset Demo Data
            </>
          )}
        </button>
      </div>
    </div>
  );
}
