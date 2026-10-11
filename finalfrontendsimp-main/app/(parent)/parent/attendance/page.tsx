"use client";

import React, { useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { calculateAttendancePercentage, formatFriendlyDate } from "@/lib/domain";
import { CalendarCheck, AlertCircle, CheckCircle, Clock } from "lucide-react";

export default function ParentAttendancePage() {
  const { students, activeChildId, attendance } = useMockStore();

  const child = students.find((s) => s.id === activeChildId) || students[0];

  const childAttendance = useMemo(() => {
    return attendance
      .filter((a) => a.studentId === child?.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, child]);

  const stats = useMemo(() => {
    let p = 0, a = 0, l = 0, e = 0;
    for (const r of childAttendance) {
      if (r.status === "PRESENT") p++;
      else if (r.status === "ABSENT") a++;
      else if (r.status === "LATE") l++;
      else if (r.status === "EXCUSED") e++;
    }
    const rate = calculateAttendancePercentage(childAttendance);
    return { present: p, absent: a, late: l, excused: e, total: childAttendance.length, rate };
  }, [childAttendance]);

  if (!child) {
    return <div className="p-8 text-center text-xs">Loading...</div>;
  }

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <CalendarCheck className="w-5 h-5 text-zinc-900" />
              Attendance Record for {child.fullName}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Monthly roll-call summary and verified presence ({child.className} - {child.sectionName})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-3 py-1.5 rounded bg-white border border-zinc-200 text-zinc-900 shadow-xs">
              September 2026
            </span>
          </div>
        </div>

        {/* Monthly Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard
            label="Attendance Rate"
            value={`${stats.rate}%`}
            subtext="Term 1 Overall"
            trend={{ positive: stats.rate >= 90, text: stats.rate >= 90 ? "Regular" : "Irregular" }}
          />
          <StatCard
            label="Days Present"
            value={stats.present}
            subtext="On-time attendance"
            icon={CheckCircle}
          />
          <StatCard
            label="Days Absent"
            value={stats.absent}
            subtext="Recorded absences"
            icon={AlertCircle}
          />
          <StatCard
            label="Late Arrivals"
            value={stats.late}
            subtext="Transit delays"
            icon={Clock}
          />
          <StatCard
            label="Excused Leave"
            value={stats.excused}
            subtext="Official leave"
          />
        </div>

        {/* Day by Day Attendance History */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
              Daily Attendance Log (September 2026)
            </h2>
            <span className="text-xs text-zinc-500 font-mono">
              {childAttendance.length} recorded school days
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                  <th className="py-2.5 px-4 w-40">Date</th>
                  <th className="py-2.5 px-4 w-32">Status</th>
                  <th className="py-2.5 px-4">Classroom Teacher Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {childAttendance.map((rec) => {
                  const dateObj = new Date(rec.date);
                  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });

                  return (
                    <tr key={rec.id} className="hover:bg-zinc-50/60">
                      <td className="py-2.5 px-4 font-mono font-medium text-zinc-900">
                        {formatFriendlyDate(rec.date)}{" "}
                        <span className="text-zinc-400 font-sans text-[11px]">
                          ({dayName})
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusBadge status={rec.status} size="sm" />
                      </td>
                      <td className="py-2.5 px-4 text-zinc-600">
                        {rec.remarks ? (
                          <span className="text-zinc-900 font-medium">{rec.remarks}</span>
                        ) : (
                          <span className="text-zinc-400 italic">Full day attendance logged</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
