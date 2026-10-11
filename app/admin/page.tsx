import React from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listClasses } from "@/lib/services/classes";
import { listParents } from "@/lib/services/parents";
import { listStudents } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { listExams } from "@/lib/services/exams";
import { listNotices } from "@/lib/services/notices";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatFriendlyDate } from "@/lib/domain";
import {
  Users,
  GraduationCap,
  Layers,
  FileSpreadsheet,
  Megaphone,
  UserCheck,
  PlusCircle,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();

  const [
    { total: studentCount },
    { total: teacherCount },
    { total: parentCount },
    { classes },
    examsResult,
    noticesResult,
  ] = await Promise.all([
    listStudents(db, ctx, { page: 1, limit: 1 }).catch(() => ({ total: 0 })),
    listTeachers(db, ctx, { page: 1, limit: 1 }).catch(() => ({ total: 0 })),
    listParents(db, ctx, { page: 1, limit: 1 }).catch(() => ({ total: 0 })),
    listClasses(db, ctx).catch(() => ({ classes: [] })),
    listExams(db, ctx, { page: 1, limit: 10 }).catch(() => ({ exams: [], total: 0 })),
    listNotices(db, ctx, { page: 1, limit: 5 }).catch(() => ({ notices: [], total: 0 })),
  ]);

  const activeExams = examsResult.exams.filter((e) => e.isActive);
  const recentNotices = noticesResult.notices.slice(0, 4);

  const quickActions = [
    { label: "Mark Attendance", href: "/admin/attendance", desc: "Daily class attendance records" },
    { label: "Exams & Schedules", href: "/admin/exams", desc: "Manage institutional exams" },
    { label: "Marks Entry & Locking", href: "/admin/marks", desc: "Review and lock marksheets" },
    { label: "Report Cards", href: "/admin/report-cards", desc: "Generate & publish PDF report cards" },
    { label: "Fee Management", href: "/admin/fees", desc: "Structures, dues & payments" },
    { label: "Timetable", href: "/admin/timetable", desc: "Section & teacher weekly schedule" },
    { label: "Homework", href: "/admin/homework", desc: "Assignments & attachments" },
    { label: "Notices & Circulars", href: "/admin/notices", desc: "Publish institutional notices" },
    { label: "Annual Promotions", href: "/admin/promotions", desc: "Promote student cohorts" },
    { label: "Past Year Papers", href: "/admin/pyqs", desc: "Question paper repository" },
    { label: "Users & Accounts", href: "/admin/users", desc: "Role grants & credentials" },
    { label: "Excel Student Import", href: "/admin/students/import", desc: "Bulk import roster" },
  ];

  return (
    <div className="space-y-6">
      {/* Header Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-950 font-serif">
            Institutional Overview
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            {ctx.profile.fullName} • {ctx.school.name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/students"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#191919] bg-[#F8F8F9] hover:bg-[#E7E7E9] border border-[#DCDCE0] rounded-md btn-interactive shadow-xs"
          >
            <Users className="w-3.5 h-3.5" />
            Manage Students
          </Link>
          <Link
            href="/admin/exams"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#191919] hover:bg-[#2D2D30] rounded-md btn-interactive shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Exams & Results
          </Link>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/students" className="block">
          <StatCard
            label="Total Enrolled Students"
            value={studentCount}
            subtext="Enrolled scholar profiles"
            icon={Users}
          />
        </Link>
        <Link href="/admin/teachers" className="block">
          <StatCard
            label="Faculty & Instructors"
            value={teacherCount}
            subtext="Assigned teaching staff"
            icon={GraduationCap}
          />
        </Link>
        <Link href="/admin/parents" className="block">
          <StatCard
            label="Registered Guardians"
            value={parentCount}
            subtext="Parent portal accounts"
            icon={UserCheck}
          />
        </Link>
        <Link href="/admin/classes" className="block">
          <StatCard
            label="Academic Classes"
            value={classes.length}
            subtext="Configured grade cohorts"
            icon={Layers}
          />
        </Link>
      </div>

      {/* Main Grid: Exam Cycles & Recent Circulars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Exam Cycles */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                Exam Cycles & Assessments
              </h2>
            </div>
            <Link
              href="/admin/exams"
              className="text-xs text-[#191919] hover:underline font-semibold inline-flex items-center gap-1 font-mono"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {activeExams.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No active exam cycles created yet. Click above to schedule an exam.
              </p>
            ) : (
              activeExams.slice(0, 5).map((exam) => (
                <div
                  key={exam.id}
                  className="p-3 rounded bg-[#E7E7E9]/50 border border-[#DCDCE0] flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-xs font-bold text-[#191919]">{exam.name}</h3>
                    <p className="text-[11px] text-[#6E6E73] font-mono mt-0.5">
                      {exam.classes?.name ?? "School-wide"} • {formatFriendlyDate(exam.startsOn)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={exam.isActive ? "ACTIVE" : "INACTIVE"} size="sm" />
                    <Link
                      href={`/admin/exams/${exam.id}`}
                      className="text-xs font-mono font-medium text-[#191919] hover:underline ml-2"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Circulars & Notices */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                Published Notices & Circulars
              </h2>
            </div>
            <Link
              href="/admin/notices"
              className="text-xs text-[#191919] hover:underline font-semibold inline-flex items-center gap-1 font-mono"
            >
              Board <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[#DCDCE0]/70">
            {recentNotices.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No circulars published. Create one in the Notices module.
              </p>
            ) : (
              recentNotices.map((notice) => (
                <div key={notice.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#191919] truncate">
                      {notice.title}
                    </span>
                    <StatusBadge
                      status={notice.category ?? "GENERAL"}
                      size="sm"
                      className="shrink-0"
                    />
                  </div>
                  <p className="text-[11px] text-[#48484A] mt-1 line-clamp-2">
                    {notice.content}
                  </p>
                  <span className="text-[10px] text-[#6E6E73] mt-1 block font-mono">
                    {formatFriendlyDate(notice.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Operational Modules & Quick Actions */}
      <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
        <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono mb-3">
          Operational Modules & Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Quick Administrative Shortcuts */}
      <div className="p-4 bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <span className="text-[#6E6E73]">QUICK OPERATIONS:</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/users" className="text-[#191919] hover:underline font-medium">
            Users & Roles
          </Link>
          <span className="text-[#DCDCE0]">•</span>
          <Link href="/admin/subjects" className="text-[#191919] hover:underline font-medium">
            Academic Subjects
          </Link>
          <span className="text-[#DCDCE0]">•</span>
          <Link href="/admin/students/import" className="text-[#191919] hover:underline font-medium">
            Bulk Student Import
          </Link>
          <span className="text-[#DCDCE0]">•</span>
          <Link href="/admin/timetable" className="text-[#191919] hover:underline font-medium">
            Timetable Schedules
          </Link>
          <span className="text-[#DCDCE0]">•</span>
          <Link href="/admin/fees" className="text-[#191919] hover:underline font-medium">
            Fee Management
          </Link>
        </div>
      </div>
    </div>
  );
}
