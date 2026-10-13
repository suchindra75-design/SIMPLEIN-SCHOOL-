"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import {
  calculateAttendancePercentage,
  formatFriendlyDate,
  isExamPublished,
} from "@/lib/domain";
import {
  CalendarCheck,
  Award,
  BookOpen,
  Megaphone,
  ArrowRight,
  Clock,
} from "lucide-react";

export default function ParentDashboardPage() {
  const {
    students,
    activeChildId,
    attendance,
    exams,
    marks,
    homework,
    notices,
  } = useMockStore();

  const child = students.find((s) => s.id === activeChildId) || students[0];

  const childAttendance = useMemo(() => {
    return attendance.filter((a) => a.studentId === child?.id);
  }, [attendance, child]);

  const attendanceRate = useMemo(() => {
    return calculateAttendancePercentage(childAttendance);
  }, [childAttendance]);

  const publishedExams = useMemo(() => {
    return exams.filter((e) => isExamPublished(e));
  }, [exams]);

  const childMarks = useMemo(() => {
    return marks.filter((m) => m.studentId === child?.id);
  }, [marks, child]);

  const latestPublishedExam = publishedExams[0];

  const examAverage = useMemo(() => {
    if (!latestPublishedExam) return 0;
    const currentExamMarks = childMarks.filter((m) => m.examId === latestPublishedExam.id);
    if (currentExamMarks.length === 0) return 0;
    const sum = currentExamMarks.reduce((acc, m) => acc + m.marksObtained, 0);
    return Math.round((sum / currentExamMarks.length) * 10) / 10;
  }, [latestPublishedExam, childMarks]);

  const upcomingExam = useMemo(() => {
    return exams.find((e) => e.status !== "PUBLISHED");
  }, [exams]);

  const childHomework = useMemo(() => {
    if (!child) return [];
    return homework.filter((h) => h.sectionId === child.sectionId);
  }, [homework, child]);

  const parentNotices = useMemo(() => {
    return notices.filter((n) => n.audience === "ALL" || n.audience === "PARENT").slice(0, 3);
  }, [notices]);

  if (!child) {
    return (
      <div className="p-8 text-center text-xs text-zinc-500">
        Loading student record...
      </div>
    );
  }

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Child Profile Banner */}
        <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded bg-zinc-950 text-white flex items-center justify-center font-bold text-xl font-mono shrink-0">
              {child.firstName[0]}
              {child.lastName[0]}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-zinc-950 font-serif">{child.fullName}</h1>
                <StatusBadge status={child.status} size="sm" />
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                {child.className} • {child.sectionName} • Roll:{" "}
                <span className="font-bold text-zinc-900">{child.rollNumber}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/parent/attendance"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded shadow-xs transition-colors"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-zinc-900" />
              Monthly Attendance
            </Link>
            <Link
              href="/parent/results"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded shadow-xs transition-colors"
            >
              <Award className="w-3.5 h-3.5" />
              View Report Card
            </Link>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            label="Attendance Standing"
            value={`${attendanceRate}%`}
            subtext="Computed over 25 school days"
            icon={CalendarCheck}
            trend={{
              positive: attendanceRate >= 90,
              text: attendanceRate >= 90 ? "Regular" : "Irregular",
            }}
          />
          <StatCard
            label="Term Assessment Average"
            value={latestPublishedExam ? `${examAverage}%` : "Pending"}
            subtext={latestPublishedExam?.title || "Awaiting publication"}
            icon={Award}
          />
          <StatCard
            label="Next Assessment"
            value={upcomingExam ? upcomingExam.title.split(" ")[0] : "None"}
            subtext={
              upcomingExam ? `Starts ${formatFriendlyDate(upcomingExam.startDate)}` : "All complete"
            }
            icon={Clock}
          />
          <StatCard
            label="Pending Homework"
            value={childHomework.length}
            subtext="Assigned tasks this week"
            icon={BookOpen}
          />
        </div>

        {/* Operational Modules */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Homework Card */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-zinc-800" />
                  <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                    Current Homework & Tasks
                  </h2>
                </div>
                <Link
                  href="/parent/homework"
                  className="text-xs text-zinc-900 hover:text-black font-semibold font-mono"
                >
                  View All
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {childHomework.slice(0, 3).map((hw) => (
                  <div
                    key={hw.id}
                    className="p-3 rounded bg-zinc-50 border border-zinc-100 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-950">
                        {hw.title}
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-300 uppercase">
                        {hw.subject}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 line-clamp-2">
                      {hw.description}
                    </p>
                    <div className="text-[10px] text-zinc-500 pt-1 flex justify-between font-mono">
                      <span>Instructor: {hw.teacherName}</span>
                      <span className="font-bold text-zinc-900">
                        Due: {formatFriendlyDate(hw.dueDate)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100">
              <Link
                href="/parent/homework"
                className="text-xs text-zinc-900 hover:underline font-bold inline-flex items-center gap-1 font-mono"
              >
                <span>Submission guidelines</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* School Notices for Parents */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-zinc-700" />
                  <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                    Official Circulars
                  </h2>
                </div>
                <Link
                  href="/parent/notices"
                  className="text-xs text-zinc-900 hover:text-black font-semibold font-mono"
                >
                  Circulars
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {parentNotices.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded bg-zinc-50 border border-zinc-100 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-950 font-serif">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {formatFriendlyDate(n.publishedDate)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 line-clamp-2 leading-relaxed">
                      {n.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100">
              <Link
                href="/parent/notices"
                className="text-xs text-zinc-900 hover:underline font-bold inline-flex items-center gap-1 font-mono"
              >
                <span>Read school circulars</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
