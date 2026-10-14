import React from "react";

type BadgeType =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "EXCUSED"
  | "LEAVE"
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

const TONES: Record<string, { tone: string; label: string }> = {
  PRESENT: { tone: "ui-badge-success", label: "Present" },
  ABSENT: { tone: "ui-badge-danger", label: "Absent" },
  LATE: { tone: "ui-badge-warning", label: "Late" },
  EXCUSED: { tone: "ui-badge-neutral", label: "Excused" },
  LEAVE: { tone: "ui-badge-info", label: "On leave" },
  PUBLISHED: { tone: "ui-badge-success", label: "Published" },
  SUBMITTED: { tone: "ui-badge-info", label: "Submitted" },
  DRAFT: { tone: "ui-badge-neutral", label: "Draft" },
  ACTIVE: { tone: "ui-badge-success", label: "Active" },
  INACTIVE: { tone: "ui-badge-neutral", label: "Inactive" },
  URGENT: { tone: "ui-badge-danger", label: "Priority" },
  SCHOOL: { tone: "ui-badge-info", label: "Whole school" },
  ALL: { tone: "ui-badge-info", label: "Whole school" },
  TEACHER: { tone: "ui-badge-info", label: "Teachers" },
  TEACHERS: { tone: "ui-badge-info", label: "Teachers" },
  PARENT: { tone: "ui-badge-info", label: "Parents" },
  PARENTS: { tone: "ui-badge-info", label: "Parents" },
};

export function StatusBadge({ status, className = "", size = "md" }: StatusBadgeProps) {
  const norm = String(status).toUpperCase();
  const match = TONES[norm];
  const tone = match?.tone ?? "ui-badge-neutral";
  const label = match?.label ?? status;
  const sizeClass = size === "sm" ? "text-[10px]" : "";

  return (
    <span className={`ui-badge ${tone} ${sizeClass} ${className}`}>
      <span aria-hidden="true" className="ui-badge-dot" />
      <span>{label}</span>
    </span>
  );
}
