"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { calculateAttendancePercentage, formatFriendlyDate } from "@/lib/domain";
import {
  Users,
  GraduationCap,
  CalendarCheck2,
  FileSpreadsheet,
  Megaphone,
  ArrowRight,
  PlusCircle,
  TrendingUp,
} from "lucide-react";

export default function AdminDashboardPage() {
  const { students, teachers, attendance, exams, notices, classes, sections } = useMockStore();

  const totalStudents = students.length;
  const totalTeachers = teachers.length;

  const latestDate = useMemo(() => {
    if (attendance.length === 0) return "2026-09-30";
    const dates = Array.from(new Set(attendance.map((a) => a.date))).sort();
    return dates[dates.length - 1];
  }, [attendance]);

  const todayRecords = useMemo(() => {
    return attendance.filter((a) => a.date === latestDate);
  }, [attendance, latestDate]);

  const todayAttendanceRate = useMemo(() => {
    return calculateAttendancePercentage(todayRecords);
  }, [todayRecords]);

  const activeExamsCount = useMemo(() => {
    return exams.filter((e) => e.status !== "PUBLISHED").length;
  }, [exams]);

  const gradeAttendanceStats = useMemo(() => {
    return classes.map((cls) => {
      const clsSectionIds = sections.filter((s) => s.classId === cls.id).map((s) => s.id);
      const clsRecords = todayRecords.filter((r) => clsSectionIds.includes(r.sectionId));
      const rate = calculateAttendancePercentage(clsRecords);
      const studentCount = students.filter((s) => clsSectionIds.includes(s.sectionId)).length;
      return {
        classId: cls.id,
        className: cls.name,
        rate,
        studentCount,
      };
    });
  }, [classes, sections, todayRecords, students]);

  const recentNotices = notices.slice(0, 3);
  const pendingExams = exams.filter((e) => e.status === "SUBMITTED" || e.status === "DRAFT");

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header Title & Date */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              Institutional Overview
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Live school metrics for {formatFriendlyDate(latestDate)} • Term 1 Operations
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/students"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors shadow-xs"
            >
              <Users className="w-3.5 h-3.5" />
              Manage Students
            </Link>
            <Link
              href="/admin/exams"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Exams & Results
            </Link>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Enrolled Students"
            value={totalStudents}
            subtext="Across 14 active class sections"
            icon={Users}
            trend={{ positive: true, text: "Capacity: 88%" }}
          />
          <StatCard
            label="Faculty & Instructors"
            value={totalTeachers}
            subtext="Certified teaching staff"
            icon={GraduationCap}
          />
          <StatCard
            label="Today's Attendance Rate"
            value={`${todayAttendanceRate}%`}
            subtext={`Computed from ${todayRecords.length} student records`}
            icon={CalendarCheck2}
            trend={{
              positive: todayAttendanceRate >= 90,
              text: todayAttendanceRate >= 90 ? "Target Met" : "Under Target",
            }}
          />
          <StatCard
            label="Pending Exam Workflows"
            value={activeExamsCount}
            subtext="Exams in Draft or Pending Review"
            icon={FileSpreadsheet}
          />
        </div>

        {/* Middle Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Attendance Breakdown */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-zinc-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-zinc-900" />
                <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                  Today&apos;s Attendance by Grade Level
                </h2>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                {formatFriendlyDate(latestDate)}
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {gradeAttendanceStats.map((item) => (
                <div key={item.classId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-800">
                      {item.className}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-400 text-[11px] font-mono">
                        {item.studentCount} students
                      </span>
                      <span className="font-mono font-bold text-zinc-950 text-xs w-12 text-right">
                        {item.rate}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full bg-zinc-950 rounded transition-all duration-500"
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Exam Approvals & Notices */}
          <div className="space-y-6">
            {/* Exam Workflow Status */}
            <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                  Exam Cycles
                </h2>
                <Link
                  href="/admin/exams"
                  className="text-xs text-zinc-900 hover:text-black font-semibold inline-flex items-center gap-1 font-mono"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="mt-3 space-y-3">
                {pendingExams.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3">All exams published</p>
                ) : (
                  pendingExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="p-3 rounded bg-zinc-50 border border-zinc-100 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-950 truncate">
                          {exam.title}
                        </span>
                        <StatusBadge status={exam.status} size="sm" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {exam.term} • {exam.subjects.length} Subjects
                      </p>
                      {exam.status === "SUBMITTED" && (
                        <div className="pt-1">
                          <Link
                            href={`/admin/exams/${exam.id}/results`}
                            className="text-[11px] text-zinc-900 hover:text-black font-bold underline font-mono"
                          >
                            Review & Publish Results →
                          </Link>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent School Circulars */}
            <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-zinc-700" />
                  <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                    Recent Circulars
                  </h2>
                </div>
                <Link
                  href="/admin/notices"
                  className="text-xs text-zinc-900 hover:text-black font-semibold font-mono"
                >
                  Board
                </Link>
              </div>

              <div className="mt-3 divide-y divide-zinc-100">
                {recentNotices.map((notice) => (
                  <div key={notice.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900 truncate">
                        {notice.title}
                      </span>
                      <StatusBadge
                        status={notice.audience}
                        size="sm"
                        className="shrink-0"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-0.5 line-clamp-2">
                      {notice.content}
                    </p>
                    <span className="text-[10px] text-zinc-400 mt-1 block font-mono">
                      {formatFriendlyDate(notice.publishedDate)}
                    </span>
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
