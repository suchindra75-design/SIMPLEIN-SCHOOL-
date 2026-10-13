"use client";

import React, { useMemo, useState } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import { BookOpen, Clock, CheckCircle2, Circle, Calendar, AlertCircle } from "lucide-react";

export default function StudentHomeworkPage() {
  const { students, activeStudentId, homework, sections, classes } = useMockStore();

  const student = students.find((s) => s.id === activeStudentId) || students[0];
  const section = sections.find((sec) => sec.id === student?.sectionId);
  const gradeClass = classes.find((c) => c.id === section?.classId);

  const [filter, setFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [completedHwIds, setCompletedHwIds] = useState<string[]>([]);

  const toggleComplete = (id: string) => {
    setCompletedHwIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const studentHomework = useMemo(() => {
    if (!student) return [];
    return homework.filter((h) => h.sectionId === student.sectionId);
  }, [homework, student]);

  const filteredHomework = useMemo(() => {
    if (filter === "PENDING") {
      return studentHomework.filter((h) => !completedHwIds.includes(h.id));
    }
    if (filter === "COMPLETED") {
      return studentHomework.filter((h) => completedHwIds.includes(h.id));
    }
    return studentHomework;
  }, [studentHomework, filter, completedHwIds]);

  if (!student) return null;

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <BookOpen className="w-5 h-5 text-zinc-900" />
              My Homework & Tasks
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Grade {gradeClass?.name || "5"}-{section?.name || "A"} • Curriculum assignments, readings, and project briefs
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
              All ({studentHomework.length})
            </button>
            <button
              onClick={() => setFilter("PENDING")}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filter === "PENDING"
                  ? "bg-zinc-950 text-white font-bold"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Pending ({studentHomework.length - completedHwIds.length})
            </button>
            <button
              onClick={() => setFilter("COMPLETED")}
              className={`px-3 py-1 rounded font-medium transition-all ${
                filter === "COMPLETED"
                  ? "bg-zinc-950 text-white font-bold"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Completed ({completedHwIds.length})
            </button>
          </div>
        </div>

        {/* Task Cards */}
        {filteredHomework.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center max-w-md mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
            <h2 className="font-serif text-base font-bold text-zinc-900 mb-1">
              All Caught Up!
            </h2>
            <p className="text-xs text-zinc-500">
              No tasks match this filter. Take a break or review upcoming materials.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredHomework.map((hw) => {
              const isCompleted = completedHwIds.includes(hw.id);
              return (
                <div
                  key={hw.id}
                  className={`bg-white border rounded-xl p-5 flex flex-col justify-between transition-all shadow-2xs ${
                    isCompleted
                      ? "border-zinc-200 bg-zinc-50/50 opacity-70"
                      : "border-zinc-200 hover:border-zinc-900"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-900">
                        {hw.subject}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Due: {formatFriendlyDate(hw.dueDate)}</span>
                      </div>
                    </div>

                    <h2
                      className={`text-base font-bold text-zinc-950 mb-2 leading-snug ${
                        isCompleted ? "line-through text-zinc-500" : ""
                      }`}
                    >
                      {hw.title}
                    </h2>

                    <p className="text-xs text-zinc-600 leading-relaxed mb-4">
                      {hw.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-zinc-400">
                      Assigned: {formatFriendlyDate(hw.assignedDate)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleComplete(hw.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                        isCompleted
                          ? "bg-zinc-200 text-zinc-800 hover:bg-zinc-300"
                          : "bg-zinc-950 text-white hover:bg-zinc-800"
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Done</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-3.5 h-3.5" />
                          <span>Mark as Completed</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AsyncStateWrapper>
  );
}
