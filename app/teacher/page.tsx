import React from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTeacherScope, listTeacherSections } from "@/lib/services/teachers";
import { listHomework } from "@/lib/services/homework";
import { listExams } from "@/lib/services/exams";
import { StatCard } from "@/components/shared/StatCard";
import { formatFriendlyDate } from "@/lib/domain";
import {
  ClipboardCheck,
  FileSpreadsheet,
  BookOpen,
  Calendar,
  Layers,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const ctx = await requireRole("TEACHER");
  const db = await createServerSupabaseClient();
  const scope = await getTeacherScope(db, ctx);

  const [{ sections }, homeworkResult, examsResult] = await Promise.all([
    scope === null
      ? Promise.resolve({ sections: [] })
      : listTeacherSections(db, ctx, scope.teacherId).catch(() => ({ sections: [] })),
    listHomework(db, ctx, { page: 1, limit: 5 }).catch(() => ({ homework: [], total: 0 })),
    listExams(db, ctx, { page: 1, limit: 5 }).catch(() => ({ exams: [], total: 0 })),
  ]);

  const homeworkList = homeworkResult.homework;
  const exams = examsResult.exams;

  const quickActions = [
    { label: "Daily Attendance", href: "/teacher/attendance", desc: "Mark class and section attendance" },
    { label: "Exams & Tests", href: "/teacher/exams", desc: "View class exam schedules" },
    { label: "Marks Entry", href: "/teacher/marks", desc: "Enter & lock exam scores" },
    { label: "Report Cards", href: "/teacher/report-cards", desc: "Review student report cards" },
    { label: "Homework", href: "/teacher/homework", desc: "Assign homework & attachments" },
    { label: "Weekly Timetable", href: "/teacher/timetable", desc: "View assigned lecture schedule" },
    { label: "School Notices", href: "/teacher/notices", desc: "View announcements & circulars" },
    { label: "Notifications", href: "/notifications", desc: "Check alerts and messages" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-zinc-950 uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded border border-zinc-300">
              Classroom Control
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              {ctx.school.name}
            </span>
          </div>
          <h1 className="text-xl font-bold text-zinc-950 mt-1 font-serif">
            Welcome back, {ctx.profile.fullName}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
            {sections.length > 0
              ? `${sections.length} assigned class section${sections.length === 1 ? "" : "s"}`
              : "No teaching sections assigned yet"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/teacher/attendance"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#191919] hover:bg-[#2D2D30] rounded-md btn-interactive shadow-xs"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Take Attendance
          </Link>
          <Link
            href="/teacher/marks"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#191919] bg-[#F8F8F9] hover:bg-[#E7E7E9] border border-[#DCDCE0] rounded-md btn-interactive shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Marks Entry
          </Link>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Assigned Sections"
          value={sections.length}
          subtext="Active classroom cohorts"
          icon={Layers}
        />
        <StatCard
          label="Active Assessments"
          value={exams.length}
          subtext="Configured examination cycles"
          icon={FileSpreadsheet}
        />
        <StatCard
          label="Homework Assignments"
          value={homeworkList.length}
          subtext="Recent student tasks"
          icon={BookOpen}
        />
      </div>

      {/* Operational Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Classes */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                My Assigned Classes & Sections
              </h2>
            </div>
            <Link
              href="/teacher/attendance"
              className="text-xs text-[#191919] hover:underline font-semibold font-mono"
            >
              Attendance →
            </Link>
          </div>

          <div className="mt-4 space-y-2.5">
            {scope === null ? (
              <div className="rounded-lg border border-dashed border-amber-300 p-6 text-center text-xs text-amber-800 bg-amber-50/50">
                No teacher profile is linked to your login yet. Contact your school administrator.
              </div>
            ) : sections.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No classes assigned. Contact your school administrator to link classes.
              </p>
            ) : (
              sections.map((sec) => (
                <div
                  key={sec.id}
                  className="p-3.5 rounded bg-[#E7E7E9]/50 border border-[#DCDCE0] flex items-center justify-between"
                >
                  <div>
                    <h3 className="text-xs font-bold text-[#191919]">
                      {sec.classes?.name ?? "Class"} — Section {sec.name}
                    </h3>
                    <span className="text-[11px] text-[#6E6E73] font-mono">
                      Active Class Cohort{sec.room ? ` · Room ${sec.room}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/teacher/attendance`}
                      className="text-xs font-mono font-medium text-[#191919] hover:underline"
                    >
                      Attendance
                    </Link>
                    <span className="text-[#DCDCE0]">·</span>
                    <Link
                      href={`/teacher/marks`}
                      className="text-xs font-mono font-medium text-[#191919] hover:underline"
                    >
                      Marks
                    </Link>
                    <span className="text-[#DCDCE0]">·</span>
                    <Link
                      href={`/teacher/homework`}
                      className="text-xs font-mono font-medium text-[#191919] hover:underline"
                    >
                      Homework
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Homework Dispatched */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                Recent Homework & Tasks
              </h2>
            </div>
            <Link
              href="/teacher/homework"
              className="text-xs text-[#191919] hover:underline font-semibold font-mono"
            >
              Manage
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {homeworkList.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No homework assigned yet. Create tasks in the Homework module.
              </p>
            ) : (
              homeworkList.slice(0, 4).map((hw) => (
                <div
                  key={hw.id}
                  className="p-3 rounded bg-[#E7E7E9]/50 border border-[#DCDCE0] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#191919]">
                      {hw.title}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F8F8F9] text-[#191919] border border-[#DCDCE0]">
                      {hw.classes?.name ?? "Class"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#48484A] line-clamp-1 font-sans">
                    {hw.description}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-[#6E6E73] pt-1 font-mono">
                    <span>Due: {formatFriendlyDate(hw.dueDate)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
        <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono mb-3">
          Teacher Operations & Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group rounded-md border border-[#DCDCE0] bg-white p-3.5 shadow-2xs transition-all hover:border-[#191919] hover:shadow-xs"
            >
              <p className="font-semibold text-xs text-[#191919] group-hover:text-black">
                {action.label} →
              </p>
              <p className="mt-1 text-[11px] text-[#6E6E73]">{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
