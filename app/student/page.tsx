import React from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { WeeklyTimetable } from "@/app/components/WeeklyTimetable";
import { listMyTimetable } from "@/lib/services/timetable";
import { listNotices } from "@/lib/services/notices";
import { listHomework } from "@/lib/services/homework";
import { listExams } from "@/lib/services/exams";
import { getStudentSummary, getStudentAttendance } from "@/lib/services/attendance";
import { listStudentFees } from "@/lib/services/fees";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatFriendlyDate } from "@/lib/domain";
import {
  CalendarCheck,
  CreditCard,
  FileSpreadsheet,
  BookOpen,
  Calendar,
  Megaphone,
  FileText,
  Award,
} from "lucide-react";

export const dynamic = "force-dynamic";

/** Student dashboard: self-only data (attendance, exams, homework, fees, notices). */
export default async function StudentDashboardPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);

  if (scope === null) {
    return (
      <div className="p-8 bg-white rounded-lg border border-zinc-200 text-center">
        <h2 className="text-sm font-bold text-zinc-950 font-mono">
          Scholar Account Pending Provisioning
        </h2>
        <p className="mt-2 text-xs text-zinc-500 font-mono">
          No student profile is linked to your login yet. Contact your school administrator.
        </p>
      </div>
    );
  }

  const [
    attendance,
    { exams },
    { homework },
    { notices },
    { slots },
    { fees },
    { records: recentAttendance },
  ] = await Promise.all([
    getStudentSummary(db, ctx, scope.studentId, {}).catch(() => ({
      percentage: null,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total: 0,
    })),
    listExams(db, ctx, { page: 1, limit: 5 }).catch(() => ({ exams: [], total: 0 })),
    listHomework(db, ctx, { page: 1, limit: 5 }).catch(() => ({ homework: [], total: 0 })),
    listNotices(db, ctx, { page: 1, limit: 5 }).catch(() => ({ notices: [], total: 0 })),
    listMyTimetable(db, ctx).catch(() => ({ slots: [] })),
    listStudentFees(db, ctx, scope.studentId).catch(() => ({ fees: [] })),
    getStudentAttendance(db, ctx, scope.studentId, { page: 1, limit: 5 }).catch(() => ({
      records: [],
      total: 0,
    })),
  ]);
  const feeDue = fees.reduce((sum, f) => sum + f.due, 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 card-interactive">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-[#191919] uppercase tracking-wider bg-[#E7E7E9] px-2 py-0.5 rounded border border-[#DCDCE0]">
              Scholar Station
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              {ctx.school.name}
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#191919] mt-1">
            {ctx.profile.fullName}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
            Enrolled Scholar Dashboard
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/student/attendance"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#191919] bg-[#F8F8F9] hover:bg-[#E7E7E9] border border-[#DCDCE0] rounded-md shadow-xs btn-interactive"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Attendance Log
          </Link>
          <Link
            href="/student/results"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#191919] hover:bg-[#2D2D30] rounded-md shadow-xs btn-interactive"
          >
            <Award className="w-3.5 h-3.5" />
            My Results
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/student/attendance" className="block">
          <StatCard
            label="Attendance Rate"
            value={attendance.percentage === null ? "100%" : `${attendance.percentage}%`}
            subtext="Current term attendance"
            icon={CalendarCheck}
            trend={{
              positive: (attendance.percentage ?? 100) >= 90,
              text: (attendance.percentage ?? 100) >= 90 ? "Regular" : "Action",
            }}
          />
        </Link>
        <Link href="/student/fees" className="block">
          <StatCard
            label="Outstanding Fee"
            value={`₹${feeDue}`}
            subtext="Total balance payable"
            icon={CreditCard}
          />
        </Link>
        <Link href="/student/exams" className="block">
          <StatCard
            label="Exam Assessments"
            value={exams.length}
            subtext="Scheduled term exams"
            icon={FileSpreadsheet}
          />
        </Link>
        <Link href="/student/homework" className="block">
          <StatCard
            label="Assigned Homework"
            value={homework.length}
            subtext="Pending subject tasks"
            icon={BookOpen}
          />
        </Link>
      </div>

      {/* Grid: Recent Attendance & Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Attendance */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                Recent Attendance Checks
              </h2>
            </div>
            <Link
              href="/student/attendance"
              className="text-xs text-[#191919] hover:underline font-semibold font-mono"
            >
              Full Log →
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {recentAttendance.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No attendance entries recorded yet.
              </p>
            ) : (
              recentAttendance.map((r) => (
                <div
                  key={r.sessionId + r.date}
                  className="p-2.5 rounded bg-[#E7E7E9]/50 border border-[#DCDCE0] flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-[#191919]">{formatFriendlyDate(r.date)}</span>
                  <StatusBadge status={r.status} size="sm" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notices */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                School Circulars
              </h2>
            </div>
            <Link
              href="/student/notices"
              className="text-xs text-[#191919] hover:underline font-semibold font-mono"
            >
              Board →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[#DCDCE0]/70">
            {notices.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No circulars published.
              </p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#191919] truncate">
                      {n.title}
                    </span>
                    <span className="text-[10px] text-[#6E6E73] font-mono">
                      {formatFriendlyDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#48484A] mt-1 line-clamp-1">
                    {n.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Timetable Section */}
      <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-[#DCDCE0]/70">
          <Calendar className="w-4 h-4 text-[#191919]" />
          <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
            Weekly Class Schedule
          </h2>
        </div>
        <div className="mt-4">
          <WeeklyTimetable slots={slots} />
        </div>
      </div>

      {/* Quick Scholar Links */}
      <div className="p-4 bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <span className="text-[#6E6E73]">SCHOLAR TERMINAL:</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/student/pyqs" className="text-[#191919] hover:underline font-medium">
            Past Question Papers (PYQs)
          </Link>
          <span className="text-[#DCDCE0]">•</span>
          <Link href="/student/results" className="text-[#191919] hover:underline font-medium">
            Published Results
          </Link>
          <span className="text-[#DCDCE0]">•</span>
          <Link href="/student/academic-history" className="text-[#191919] hover:underline font-medium">
            Academic History
          </Link>
        </div>
      </div>
    </div>
  );
}
