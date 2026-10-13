import React from "react";

type BadgeType =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "EXCUSED"
  | "PUBLISHED"
  | "SUBMITTED"
  | "DRAFT"
  | "Active"
  | "Inactive"
  | "ACTIVE"
  | "INACTIVE"
  | "Urgent"
  | "Normal"
  | "SCHOOL"
  | "ALL"
  | "TEACHER"
  | "PARENT"
  | "STUDENT";

interface StatusBadgeProps {
  status: BadgeType | string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, className = "", size = "md" }: StatusBadgeProps) {
  const norm = String(status).toUpperCase();

  let styles = "bg-zinc-100 text-zinc-900 border-zinc-300";
  let label = status;
  let dotColor = "bg-zinc-900";

  switch (norm) {
    case "PRESENT":
      styles = "bg-zinc-900 text-white border-zinc-900";
      label = "Present";
      dotColor = "bg-white";
      break;
    case "ABSENT":
      styles = "bg-white text-zinc-900 border-zinc-900 ring-1 ring-zinc-900";
      label = "Absent";
      dotColor = "bg-zinc-900";
      break;
    case "LATE":
      styles = "bg-zinc-100 text-zinc-900 border-zinc-400";
      label = "Late";
      dotColor = "bg-zinc-500";
      break;
    case "EXCUSED":
      styles = "bg-zinc-50 text-zinc-600 border-zinc-200";
      label = "Excused";
      dotColor = "bg-zinc-400";
      break;
    case "PUBLISHED":
      styles = "bg-zinc-900 text-white border-zinc-900";
      label = "Published";
      dotColor = "bg-white";
      break;
    case "SUBMITTED":
      styles = "bg-zinc-100 text-zinc-900 border-zinc-900";
      label = "Submitted";
      dotColor = "bg-zinc-900";
      break;
    case "DRAFT":
      styles = "bg-white text-zinc-600 border-zinc-300 border-dashed";
      label = "Draft";
      dotColor = "bg-zinc-400";
      break;
    case "ACTIVE":
      styles = "bg-zinc-900 text-white border-zinc-900";
      label = "Active";
      dotColor = "bg-white";
      break;
    case "INACTIVE":
      styles = "bg-zinc-100 text-zinc-500 border-zinc-300";
      label = "Inactive";
      dotColor = "bg-zinc-400";
      break;
    case "URGENT":
      styles = "bg-zinc-900 text-white border-zinc-900";
      label = "Priority Memo";
      dotColor = "bg-white";
      break;
    case "SCHOOL":
    case "ALL":
      styles = "bg-zinc-100 text-zinc-800 border-zinc-200";
      label = "All School";
      dotColor = "bg-zinc-600";
      break;
    case "TEACHER":
    case "TEACHERS":
      styles = "bg-zinc-100 text-zinc-800 border-zinc-200";
      label = "Faculty";
      dotColor = "bg-zinc-600";
      break;
    case "PARENT":
    case "PARENTS":
      styles = "bg-zinc-100 text-zinc-800 border-zinc-200";
      label = "Parents";
      dotColor = "bg-zinc-600";
      break;
  }

  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-md border tracking-wider uppercase transition-colors ${styles} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
}
