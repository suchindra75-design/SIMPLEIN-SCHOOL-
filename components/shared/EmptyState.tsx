import React from "react";
import Link from "next/link";
import { LucideIcon, Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }> | React.ReactNode;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
  className = "",
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function" || typeof icon === "object") {
      const IconComponent = icon as React.ComponentType<{ className?: string }>;
      return <IconComponent className="w-5 h-5 stroke-[1.5]" />;
    }
    return <Inbox className="w-5 h-5 stroke-[1.5]" />;
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-lg border border-dashed border-[#DCDCE0] bg-[#F8F8F9] ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[#E7E7E9] flex items-center justify-center text-[#191919] mb-3 border border-[#DCDCE0]">
        {renderIcon()}
      </div>
      <h3 className="text-sm font-semibold text-[#191919] mb-1">{title}</h3>
      <p className="text-xs text-[#6E6E73] max-w-sm mb-4 leading-relaxed font-mono">
        {description}
      </p>
      {action && action.href ? (
        <Link
          href={action.href}
          className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-white bg-[#191919] hover:bg-[#2D2D30] rounded-md btn-interactive shadow-xs"
        >
          {action.label}
        </Link>
      ) : action && action.onClick ? (
        <button
          onClick={action.onClick}
          className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-white bg-[#191919] hover:bg-[#2D2D30] rounded-md btn-interactive shadow-xs cursor-pointer"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
