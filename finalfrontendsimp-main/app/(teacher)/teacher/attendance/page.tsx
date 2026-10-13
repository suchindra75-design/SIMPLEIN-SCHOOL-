"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AttendanceStatus } from "@/lib/types";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import {
  ClipboardCheck,
  CheckCheck,
  Save,
  Check,
  Calendar,
  Layers,
} from "lucide-react";

export default function TeacherAttendancePage() {
  const { sections, students, attendance, saveAttendanceBatch } = useMockStore();

  const [selectedSectionId, setSelectedSectionId] = useState<string>("sec-5a");
  const [selectedDate, setSelectedDate] = useState<string>("2026-09-30");

  const [attendanceState, setAttendanceState] = useState<
    Record<string, { status: AttendanceStatus; remarks: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const sectionStudents = useMemo(() => {
    return students.filter((s) => s.sectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  useEffect(() => {
    const existingMap: Record<string, { status: AttendanceStatus; remarks: string }> = {};

    for (const student of sectionStudents) {
      const rec = attendance.find(
        (a) => a.studentId === student.id && a.date === selectedDate
      );
      if (rec) {
        existingMap[student.id] = {
          status: rec.status,
          remarks: rec.remarks || "",
        };
      } else {
        existingMap[student.id] = {
          status: "PRESENT",
          remarks: "",
        };
      }
    }

    setAttendanceState(existingMap);
    setSaveSuccess(false);
  }, [selectedSectionId, selectedDate, sectionStudents, attendance]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setAttendanceState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks,
      },
    }));
  };

  const handleMarkAllPresent = () => {
    const updated: Record<string, { status: AttendanceStatus; remarks: string }> = {};
    for (const s of sectionStudents) {
      updated[s.id] = {
        status: "PRESENT",
        remarks: attendanceState[s.id]?.remarks || "",
      };
    }
    setAttendanceState(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    const batch = sectionStudents.map((s) => ({
      studentId: s.id,
      sectionId: selectedSectionId,
      date: selectedDate,
      status: attendanceState[s.id]?.status || "PRESENT",
      remarks: attendanceState[s.id]?.remarks || undefined,
    }));

    await saveAttendanceBatch(batch);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const summary = useMemo(() => {
    let p = 0, a = 0, l = 0, e = 0;
    for (const s of sectionStudents) {
      const st = attendanceState[s.id]?.status || "PRESENT";
      if (st === "PRESENT") p++;
      else if (st === "ABSENT") a++;
      else if (st === "LATE") l++;
      else if (st === "EXCUSED") e++;
    }
    return { present: p, absent: a, late: l, excused: e, total: sectionStudents.length };
  }, [sectionStudents, attendanceState]);

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header Controls */}
        <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <ClipboardCheck className="w-5 h-5 text-zinc-900" />
              Daily Attendance Register
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              Roll-call register, tardiness logging, and verified presence
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-semibold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-mono text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>
        </div>

        {/* Live Counters & Bulk Actions Bar */}
        <div className="bg-zinc-950 text-white rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-4 text-xs flex-wrap font-mono font-medium">
            <span className="text-zinc-400">
              Total: <strong className="text-white">{summary.total}</strong>
            </span>
            <span className="text-zinc-200">
              Present: <strong className="text-white">{summary.present}</strong>
            </span>
            <span className="text-zinc-200">
              Absent: <strong className="text-white">{summary.absent}</strong>
            </span>
            <span className="text-zinc-200">
              Late: <strong className="text-white">{summary.late}</strong>
            </span>
            <span className="text-zinc-400">
              Excused: <strong className="text-white">{summary.excused}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleMarkAllPresent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-700 transition-colors font-mono"
            >
              <CheckCheck className="w-3.5 h-3.5 text-zinc-300" />
              Mark All Present
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-black bg-white hover:bg-zinc-100 rounded transition-colors shadow-xs disabled:opacity-50 font-mono"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving..." : "Save Register"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Student Register Table */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                  <th className="py-3 px-4 w-20">Roll #</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Status Selector</th>
                  <th className="py-3 px-4">Remarks / Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sectionStudents.map((student) => {
                  const currentStatus = attendanceState[student.id]?.status || "PRESENT";
                  const currentRemarks = attendanceState[student.id]?.remarks || "";

                  return (
                    <tr key={student.id} className="hover:bg-zinc-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-zinc-950">
                        {student.rollNumber}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-zinc-950 block">
                          {student.fullName}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          {student.parentPhone}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="inline-flex rounded p-1 bg-zinc-100 border border-zinc-200 gap-1">
                          {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatus[]).map(
                            (st) => {
                              const active = currentStatus === st;
                              const activeStyles =
                                "bg-zinc-950 text-white font-bold shadow-xs";

                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleStatusChange(student.id, st)}
                                  className={`px-2.5 py-1 text-[11px] rounded transition-all font-mono ${
                                    active
                                      ? activeStyles
                                      : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50 font-medium"
                                  }`}
                                >
                                  {st.charAt(0) + st.slice(1).toLowerCase()}
                                </button>
                              );
                            }
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={currentRemarks}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          placeholder={
                            currentStatus === "ABSENT"
                              ? "Reason for absence..."
                              : currentStatus === "LATE"
                              ? "Arrival time / bus delay..."
                              : "Optional note..."
                          }
                          className="w-full max-w-sm px-2.5 py-1.5 text-xs rounded border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400 text-zinc-800"
                        />
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
