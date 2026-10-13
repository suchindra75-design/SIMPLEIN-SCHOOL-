"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import {
  ClipboardCheck,
  FileSpreadsheet,
  BookOpen,
  Calendar,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function TeacherDashboardPage() {
  const { currentPersona, sections, students, attendance, exams, homework } =
    useMockStore();

  const teacherSections = useMemo(() => {
    if (!currentPersona.teacherId) return sections.slice(0, 2);
    return sections.filter((s) => s.classTeacherId === currentPersona.teacherId);
  }, [sections, currentPersona]);

  const primarySection = teacherSections[0] || sections[0];
  const today = "2026-09-30";

  const primarySectionStudents = useMemo(() => {
    return students.filter((s) => s.sectionId === primarySection.id);
  }, [students, primarySection]);

  const todayMarkedCount = useMemo(() => {
    return attendance.filter(
      (a) => a.sectionId === primarySection.id && a.date === today
    ).length;
  }, [attendance, primarySection, today]);

  const isAttendanceDoneToday = todayMarkedCount >= primarySectionStudents.length;

  const teacherHomework = useMemo(() => {
    return homework.filter((h) => h.sectionId === primarySection.id);
  }, [homework, primarySection]);

  const activeExams = useMemo(() => {
    return exams.filter((e) => e.status !== "PUBLISHED");
  }, [exams]);

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-zinc-950 uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded border border-zinc-300">
                Classroom Control
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                {formatFriendlyDate(today)}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-950 font-serif mt-1">
              Welcome back, {currentPersona.name}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Assigned Section: <strong className="text-zinc-950">{primarySection.fullName}</strong> ({primarySection.roomNumber})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/teacher/attendance"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              {isAttendanceDoneToday ? "Review Register" : "Take Attendance"}
            </Link>
            <Link
              href="/teacher/marks"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Marks Entry
            </Link>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Section Student Roster"
            value={primarySectionStudents.length}
            subtext={`${primarySection.fullName} • Room ${primarySection.roomNumber}`}
          />
          <StatCard
            label="Today's Register Status"
            value={isAttendanceDoneToday ? "Complete" : "Action Needed"}
            subtext={
              isAttendanceDoneToday
                ? `${todayMarkedCount} checks recorded`
                : "Morning roll call pending"
            }
            icon={ClipboardCheck}
            trend={{
              positive: isAttendanceDoneToday,
              text: isAttendanceDoneToday ? "Recorded" : "Pending",
            }}
          />
          <StatCard
            label="Pending Exam Assessments"
            value={activeExams.length}
            subtext="Mid-Term & Final Term cycles"
            icon={FileSpreadsheet}
          />
        </div>

        {/* Operational Modules */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Attendance Action Card */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-zinc-900" />
                  <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                    Morning Attendance Register
                  </h2>
                </div>
                {isAttendanceDoneToday ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-300">
                    <CheckCircle2 className="w-3 h-3 text-zinc-900" /> Submitted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                    <Clock className="w-3 h-3" /> Pending Submission
                  </span>
                )}
              </div>

              <div className="mt-4 p-4 rounded bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Class & Section:</span>
                  <span className="font-semibold text-zinc-950">
                    {primarySection.fullName}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Roll Call Date:</span>
                  <span className="font-mono text-zinc-900">
                    {formatFriendlyDate(today)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Student Headcount:</span>
                  <span className="font-mono font-bold text-zinc-950">
                    {primarySectionStudents.length} Students
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-zinc-100">
              <Link
                href="/teacher/attendance"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded bg-zinc-950 hover:bg-zinc-800 text-white transition-colors"
              >
                <span>Open Interactive Attendance Register</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Pending Marks & Homework */}
          <div className="space-y-6">
            {/* Homework Status */}
            <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-zinc-700" />
                  <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                    Recent Homework Dispatched
                  </h2>
                </div>
                <Link
                  href="/teacher/homework"
                  className="text-xs text-zinc-900 hover:text-black font-semibold font-mono"
                >
                  Manage
                </Link>
              </div>

              <div className="mt-3 space-y-3">
                {teacherHomework.map((hw) => (
                  <div
                    key={hw.id}
                    className="p-3 rounded bg-zinc-50 border border-zinc-100 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-950">
                        {hw.title}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-zinc-800 border border-zinc-200">
                        {hw.subject}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 font-mono">
                      <span>Due: {formatFriendlyDate(hw.dueDate)}</span>
                      <span className="font-bold text-zinc-950">
                        Submissions: {hw.submissionCount} / {hw.totalStudents}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
