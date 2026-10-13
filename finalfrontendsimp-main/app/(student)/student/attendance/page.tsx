"use client";

import React, { useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { calculateAttendancePercentage, formatFriendlyDate } from "@/lib/domain";
import { CalendarCheck, AlertCircle, CheckCircle, Clock } from "lucide-react";

export default function StudentAttendancePage() {
  const { students, activeStudentId, attendance, sections, classes } = useMockStore();

  const student = students.find((s) => s.id === activeStudentId) || students[0];
  const section = sections.find((sec) => sec.id === student?.sectionId);
  const gradeClass = classes.find((c) => c.id === section?.classId);

  const studentAttendance = useMemo(() => {
    return attendance
      .filter((a) => a.studentId === student?.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, student]);

  const stats = useMemo(() => {
    let p = 0,
      a = 0,
      l = 0,
      e = 0;
    for (const r of studentAttendance) {
      const statusUpper = r.status.toUpperCase();
      if (statusUpper === "PRESENT") p++;
      else if (statusUpper === "ABSENT") a++;
      else if (statusUpper === "LATE") l++;
      else if (statusUpper === "EXCUSED") e++;
    }
    const rate = calculateAttendancePercentage(studentAttendance);
    return { present: p, absent: a, late: l, excused: e, total: studentAttendance.length, rate };
  }, [studentAttendance]);

  if (!student) {
    return <div className="p-8 text-center text-xs">Loading attendance profile...</div>;
  }

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <CalendarCheck className="w-5 h-5 text-zinc-900" />
              My Attendance Record
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Grade {gradeClass?.name || "5"}-{section?.name || "A"} • Roll: {student.rollNumber} • Official School Register
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-3 py-1.5 rounded bg-white border border-zinc-200 text-zinc-900 shadow-2xs">
              Term 1 (September 2026)
            </span>
          </div>
        </div>

        {/* Monthly Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Attendance Rate"
            value={`${stats.rate}%`}
            subtext="Benchmark: > 90%"
            icon={CalendarCheck}
          />
          <StatCard
            label="Days Present"
            value={stats.present}
            subtext="Full day attendance"
            icon={CheckCircle}
          />
          <StatCard
            label="Late Arrivals"
            value={stats.late}
            subtext="Tardy after 08:30"
            icon={Clock}
          />
          <StatCard
            label="Unexcused Absences"
            value={stats.absent}
            subtext="Recorded by registry"
            icon={AlertCircle}
          />
        </div>

        {/* Log Table */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-serif text-sm font-bold text-zinc-900">
              Daily Attendance Register
            </h2>
            <span className="text-xs font-mono text-zinc-500">
              {studentAttendance.length} records logged
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/75 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-4 font-semibold">Date</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Class Period</th>
                  <th className="py-2.5 px-4 font-semibold">Teacher Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {studentAttendance.map((rec) => (
                  <tr key={rec.id} className="hover:bg-zinc-50/50">
                    <td className="py-2.5 px-4 font-mono font-medium text-zinc-900 whitespace-nowrap">
                      {formatFriendlyDate(rec.date)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusBadge status={rec.status.toUpperCase()} />
                    </td>
                    <td className="py-2.5 px-4 text-zinc-600 font-mono">
                      Full Day Session
                    </td>
                    <td className="py-2.5 px-4 text-zinc-600 max-w-xs truncate">
                      {rec.remarks || "Regular session completed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
