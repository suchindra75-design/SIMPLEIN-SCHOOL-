"use client";

import React, { useMemo, useState } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import { BookOpen, Clock } from "lucide-react";

export default function ParentHomeworkPage() {
  const { students, activeChildId, homework } = useMockStore();

  const child = students.find((s) => s.id === activeChildId) || students[0];
  const [filter, setFilter] = useState<"ALL" | "ACTIVE">("ALL");

  const childHomework = useMemo(() => {
    if (!child) return [];
    return homework.filter((h) => h.sectionId === child.sectionId);
  }, [homework, child]);

  if (!child) return null;

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <BookOpen className="w-5 h-5 text-zinc-900" />
              Homework Tracker: {child.fullName}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Curriculum assignments, lab reports, and deadlines for {child.className} ({child.sectionName})
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white rounded border border-zinc-200 p-1 text-xs">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filter === "ALL"
                  ? "bg-zinc-950 text-white font-bold"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              All Assignments ({childHomework.length})
            </button>
            <button
              onClick={() => setFilter("ACTIVE")}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filter === "ACTIVE"
                  ? "bg-zinc-950 text-white font-bold"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Due This Week
            </button>
          </div>
        </div>

        {/* Homework List */}
        <div className="space-y-4">
          {childHomework.length === 0 ? (
            <div className="bg-white rounded-lg border border-zinc-200 p-8 text-center text-xs text-zinc-400">
              No homework assignments currently logged for this section.
            </div>
          ) : (
            childHomework.map((hw) => (
              <div
                key={hw.id}
                className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col justify-between hover:border-zinc-900 transition-all"
              >
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-800 border border-zinc-300 uppercase">
                        {hw.subject}
                      </span>
                      <h2 className="text-sm font-bold text-zinc-950 font-serif">{hw.title}</h2>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-800 bg-zinc-100 px-2.5 py-0.5 rounded border border-zinc-300 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Due: {formatFriendlyDate(hw.dueDate)}</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed mt-2 whitespace-pre-line">
                    {hw.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono">
                  <span>Assigned by instructor: <strong className="text-zinc-900">{hw.teacherName}</strong></span>
                  <span>Assigned on: {formatFriendlyDate(hw.assignedDate)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
