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
  /** Accent for the value (Admin Portal UI spec KPI colours). */
  tone?: "blue" | "green" | "purple" | "amber";
}

const TONE_CLASS: Record<NonNullable<StatCardProps["tone"]>, string> = {
  blue: "text-primary",
  green: "text-success",
  purple: "text-[#6d3fc4]",
  amber: "text-warning",
};

export function StatCard({
  label,
  value,
  subtext,
  icon,
  trend,
  onClick,
  className = "",
  tone,
}: StatCardProps) {
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function" || typeof icon === "object") {
      const IconComponent = icon as React.ComponentType<{ className?: string }>;
      return <IconComponent className="size-4" />;
    }
    return null;
  };

  const trendTone =
    trend?.positive === true
      ? "ui-badge-success"
      : trend?.positive === false
        ? "ui-badge-warning"
        : "ui-badge-neutral";

  return (
    <div
      onClick={onClick}
      className={`ui-card p-5 ${onClick ? "ui-card-interactive cursor-pointer" : ""} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            {renderIcon()}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className={`text-2xl font-bold tracking-tight tabular-nums sm:text-[1.75rem] ${tone === undefined ? "text-foreground" : TONE_CLASS[tone]}`}>
          {value}
        </span>
        {trend && <span className={`ui-badge ${trendTone}`}>{trend.text}</span>}
      </div>

      {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}
