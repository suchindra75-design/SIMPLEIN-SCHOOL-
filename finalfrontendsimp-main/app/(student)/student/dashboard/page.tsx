"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  CalendarCheck,
  BookOpen,
  Award,
  Clock,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  AlertCircle,
  Megaphone,
} from "lucide-react";

export default function StudentDashboardPage() {
  const {
    students,
    activeStudentId,
    attendance,
    marks,
    exams,
    homework,
    notices,
    classes,
    sections,
  } = useMockStore();

  const student = students.find((s) => s.id === activeStudentId) || students[0];
  const section = sections.find((sec) => sec.id === student?.sectionId);
  const gradeClass = classes.find((c) => c.id === section?.classId);

  // Completed homework local toggle for student interactivity
  const [completedHwIds, setCompletedHwIds] = useState<string[]>([]);

  const toggleHwCompleted = (hwId: string) => {
    setCompletedHwIds((prev) =>
      prev.includes(hwId) ? prev.filter((id) => id !== hwId) : [...prev, hwId]
    );
  };

  // Calculate attendance for Lucas
  const myAttendance = attendance.filter((a) => a.studentId === student?.id);
  const totalDays = myAttendance.length || 30;
  const presentDays = myAttendance.filter((a) => a.status.toUpperCase() === "PRESENT").length || 28;
  const attendanceRate = Math.round((presentDays / totalDays) * 100);

  // Lucas marks
  const myMarks = marks.filter((m) => m.studentId === student?.id);
  const avgMarks =
    myMarks.length > 0
      ? Math.round(
          myMarks.reduce((acc, curr) => acc + (curr.marksObtained / curr.maxMarks) * 100, 0) /
            myMarks.length
        )
      : 91;

  // Active Homework for 5-A
  const myHomework = homework.filter((h) => h.sectionId === student?.sectionId);

  // School Notices
  const relevantNotices = notices.slice(0, 3);

  // Timetable
  const scheduleToday = [
    { time: "08:30 – 09:10", subject: "Homeroom & Morning Advisory", teacher: "Ms. Jenkins", room: "Room 105" },
    { time: "09:15 – 10:05", subject: "Advanced Mathematics", teacher: "Mr. Taylor", room: "Room 204" },
    { time: "10:15 – 11:05", subject: "Experimental Science (Lab)", teacher: "Ms. Jenkins", room: "Science Lab B" },
    { time: "11:15 – 12:05", subject: "English Literature & Grammar", teacher: "Ms. Brooks", room: "Room 102" },
    { time: "12:05 – 13:00", subject: "Lunch & Outdoor Recreation", teacher: "Staff", room: "Main Quad" },
    { time: "13:05 – 13:55", subject: "Social Studies & Geography", teacher: "Mr. Davies", room: "Room 105" },
    { time: "14:00 – 14:45", subject: "Visual Arts & Composition", teacher: "Ms. Rivera", room: "Studio A" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 border border-zinc-200">
              Grade {gradeClass?.name || "5"} • Section {section?.name || "A"}
            </span>
            <span className="text-xs font-mono text-zinc-500">Roll: {student?.rollNumber}</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
            Welcome back, {student?.firstName || "Lucas"}!
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 mt-1">
            Term 1 Academic Session is in session. Next class starts in 25 minutes.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link
            href="/student/results"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-zinc-950 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <Award className="w-3.5 h-3.5" />
            <span>View Report Card</span>
          </Link>
          <Link
            href="/student/homework"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-zinc-200 bg-white text-zinc-800 text-xs font-semibold hover:bg-zinc-50 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tasks ({myHomework.length})</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Attendance Rate"
          value={`${attendanceRate}%`}
          subtext={`${presentDays} of ${totalDays} sessions present`}
          icon={CalendarCheck}
        />
        <StatCard
          label="Academic Standing"
          value={`${avgMarks}%`}
          subtext="Honors List • Grade A-"
          icon={Award}
        />
        <StatCard
          label="Assigned Tasks"
          value={myHomework.length}
          subtext={`${myHomework.length - completedHwIds.length} tasks remaining`}
          icon={BookOpen}
        />
        <StatCard
          label="Current Period"
          value="Science Lab"
          subtext="10:15 AM • Lab B with Ms. Jenkins"
          icon={Clock}
        />
      </div>

      {/* Grid Layout: Schedule & Homework */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Today's Timetable */}
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
            <div>
              <h2 className="font-serif text-lg font-bold text-zinc-950">Today’s Timetable</h2>
              <p className="text-xs text-zinc-500 font-mono">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-zinc-100 text-zinc-800">
              Day 4 of Cycle
            </span>
          </div>

          <div className="divide-y divide-zinc-100">
            {scheduleToday.map((period, idx) => {
              const isCurrent = idx === 2; // Simulated current period
              return (
                <div
                  key={idx}
                  className={`py-3 px-3 rounded-lg flex items-center justify-between transition-colors ${
                    isCurrent ? "bg-zinc-100/80 border border-zinc-300 font-medium" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-zinc-500 w-24 shrink-0">
                      {period.time}
                    </span>
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-zinc-950 flex items-center gap-2">
                        <span>{period.subject}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono uppercase bg-zinc-950 text-white px-1.5 py-0.2 rounded font-bold">
                            Now
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Instructor: {period.teacher}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-zinc-600 bg-white px-2 py-1 rounded border border-zinc-200 shrink-0">
                    {period.room}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Homework & Tasks */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
              <h2 className="font-serif text-lg font-bold text-zinc-950">Active Homework</h2>
              <Link
                href="/student/homework"
                className="text-xs font-mono font-semibold text-zinc-900 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {myHomework.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">No assignments due at this time.</p>
            ) : (
              <div className="space-y-3">
                {myHomework.slice(0, 4).map((hw) => {
                  const isDone = completedHwIds.includes(hw.id);
                  return (
                    <div
                      key={hw.id}
                      className={`p-3 rounded-lg border transition-all ${
                        isDone
                          ? "bg-zinc-50 border-zinc-200 opacity-60"
                          : "bg-white border-zinc-200 hover:border-zinc-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleHwCompleted(hw.id)}
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                              isDone
                                ? "bg-zinc-950 border-zinc-950 text-white"
                                : "border-zinc-300 hover:border-zinc-900 bg-white"
                            }`}
                            title={isDone ? "Mark as pending" : "Mark as completed"}
                          >
                            {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono uppercase font-bold text-zinc-600 bg-zinc-100 px-1.5 py-0.2 rounded border border-zinc-200">
                                {hw.subject}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">
                                Due: {hw.dueDate}
                              </span>
                            </div>
                            <h3
                              className={`text-xs sm:text-sm font-semibold text-zinc-950 mt-1 ${
                                isDone ? "line-through text-zinc-500" : ""
                              }`}
                            >
                              {hw.title}
                            </h3>
                            <p className="text-xs text-zinc-600 line-clamp-2 mt-0.5">
                              {hw.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* School Announcements */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
              <h2 className="font-serif text-lg font-bold text-zinc-950">School Bulletins</h2>
              <Link
                href="/student/notices"
                className="text-xs font-mono font-semibold text-zinc-900 hover:underline flex items-center gap-1"
              >
                Board <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {relevantNotices.map((n) => (
                <div key={n.id} className="p-3 border border-zinc-200 rounded-lg hover:border-zinc-900 transition-colors">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mb-1">
                    <span>{n.publishedDate}</span>
                    <span className="uppercase">{n.authorName}</span>
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900 mb-1">{n.title}</h3>
                  <p className="text-xs text-zinc-600 line-clamp-2">{n.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
