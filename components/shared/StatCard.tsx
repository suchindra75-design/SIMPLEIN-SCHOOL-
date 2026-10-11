import React from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }> | React.ReactNode;
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
  icon,
  trend,
  onClick,
  className = "",
}: StatCardProps) {
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function" || typeof icon === "object") {
      const IconComponent = icon as React.ComponentType<{ className?: string }>;
      return <IconComponent className="w-3.5 h-3.5" />;
    }
    return null;
  };

  return (
    <div
      onClick={onClick}
      className={`bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs card-interactive ${
        onClick ? "cursor-pointer hover:border-[#191919] active:scale-[0.99]" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <div className="p-1.5 rounded-md bg-[#E7E7E9] text-[#191919]">
            {renderIcon()}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#191919] font-mono">
          {value}
        </span>
        {trend && (
          <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#E7E7E9] text-[#191919] border border-[#DCDCE0]">
            {trend.text}
          </span>
        )}
      </div>

      {subtext && <p className="mt-1.5 text-xs text-[#6E6E73]">{subtext}</p>}
    </div>
  );
}
