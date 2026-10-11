"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  trend?: {
    positive?: boolean;
    text: string;
  };
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  onClick,
  className = "",
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-zinc-200 p-5 shadow-xs transition-all ${
        onClick ? "cursor-pointer hover:border-zinc-900" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <div className="p-1.5 rounded-md bg-zinc-100 text-zinc-900">
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 font-mono">
          {value}
        </span>
        {trend && (
          <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
            {trend.text}
          </span>
        )}
      </div>

      {subtext && <p className="mt-1.5 text-xs text-zinc-500">{subtext}</p>}
    </div>
  );
}
