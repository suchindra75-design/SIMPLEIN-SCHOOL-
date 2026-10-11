"use client";

import React, { useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import { Megaphone, AlertCircle } from "lucide-react";

export default function StudentNoticesPage() {
  const { notices } = useMockStore();

  const studentNotices = useMemo(() => {
    return notices.filter((n) => n.audience === "ALL" || (n as any).audience === "STUDENT" || n.audience === "PARENT");
  }, [notices]);

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-zinc-200 pb-5">
          <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
            <Megaphone className="w-5 h-5 text-zinc-900" />
            School Notices & Campus Bulletins
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            Official circulars, extracurricular schedules, examinations, and assembly advisories
          </p>
        </div>

        {/* Notices Feed */}
        <div className="space-y-4">
          {studentNotices.map((n) => (
            <div
              key={n.id}
              className={`bg-white rounded-lg border p-5 shadow-2xs transition-all ${
                n.isUrgent ? "border-zinc-950 ring-1 ring-zinc-950" : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.isUrgent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-950 text-white uppercase">
                      <AlertCircle className="w-3 h-3" />
                      Priority Memo
                    </span>
                  )}
                  <h2 className="text-sm font-bold text-zinc-950 font-serif">{n.title}</h2>
                </div>

                <span className="text-[11px] text-zinc-500 font-mono">
                  {formatFriendlyDate(n.publishedDate)}
                </span>
              </div>

              <p className="text-xs text-zinc-700 leading-relaxed mt-2 whitespace-pre-line">
                {n.content}
              </p>

              <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                <span>Issued by: {n.authorName}</span>
                <span className="uppercase text-[10px] bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                  Target: {n.audience}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
