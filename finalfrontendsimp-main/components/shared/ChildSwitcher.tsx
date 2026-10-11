"use client";

import React from "react";
import { useMockStore } from "@/lib/mock-store";
import { UserCheck } from "lucide-react";

export function ChildSwitcher() {
  const { currentPersona, parents, students, activeChildId, setActiveChildId } = useMockStore();

  if (currentPersona.role !== "parent" || !currentPersona.parentId) {
    return null;
  }

  const parentRecord = parents.find((p) => p.id === currentPersona.parentId);
  if (!parentRecord || parentRecord.childrenStudentIds.length <= 1) {
    return null;
  }

  const linkedChildren = students.filter((s) =>
    parentRecord.childrenStudentIds.includes(s.id)
  );

  return (
    <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-md border border-zinc-200">
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 flex items-center gap-1">
        <UserCheck className="w-3.5 h-3.5 text-zinc-800" />
        Student:
      </span>
      <div className="flex items-center gap-1">
        {linkedChildren.map((child) => {
          const isActive = child.id === activeChildId;
          return (
            <button
              key={child.id}
              onClick={() => setActiveChildId(child.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                isActive
                  ? "bg-zinc-900 text-white shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60"
              }`}
            >
              {child.fullName} ({child.className})
            </button>
          );
        })}
      </div>
    </div>
  );
}
