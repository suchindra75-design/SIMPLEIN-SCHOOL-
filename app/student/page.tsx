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
import { SectionCard } from "@/app/admin/_components/ui";
import {
  Archive,
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  History,
  Megaphone,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Student dashboard: self-only data (attendance, exams, homework, fees, notices). */
export default async function StudentDashboardPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);

  if (scope === null) {
    return (
      <div className="ui-card mx-auto mt-4 max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">Your student profile isn&apos;t linked yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No student profile is linked to your login. Please contact your school office.
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

  const hasAttendance = attendance.percentage !== null;
  const firstName = ctx.profile.fullName.split(" ")[0] ?? ctx.profile.fullName;
  const moreLinks = [
    { label: "Results", href: "/student/results", desc: "Published exam results", icon: ClipboardList },
    { label: "Report cards", href: "/student/report-cards", desc: "Term report cards", icon: Award },
    { label: "Question papers", href: "/student/pyqs", desc: "Previous year papers", icon: Archive },
    { label: "Academic history", href: "/student/academic-history", desc: "Past classes and years", icon: History },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <p className="page-description">Here is what&apos;s happening at {ctx.school.name}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/student/attendance" className="ui-btn ui-btn-secondary">
            <CalendarCheck aria-hidden="true" className="size-4" />
            Attendance
          </Link>
          <Link href="/student/results" className="ui-btn ui-btn-primary">
            <ClipboardList aria-hidden="true" className="size-4" />
            My results
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/student/attendance" className="block rounded-[var(--radius-card)]">
          <StatCard
            label="Attendance"
            value={hasAttendance ? `${attendance.percentage}%` : "—"}
            subtext={hasAttendance ? "Overall attendance" : "No attendance recorded yet"}
            icon={CalendarCheck}
            trend={
              hasAttendance
                ? {
                    positive: (attendance.percentage ?? 0) >= 90,
                    text: (attendance.percentage ?? 0) >= 90 ? "On track" : "Needs attention",
                  }
                : undefined
            }
            className="ui-card-interactive h-full"
          />
        </Link>
        <Link href="/student/fees" className="block rounded-[var(--radius-card)]">
          <StatCard
            label="Fees due"
            value={inr.format(feeDue)}
            subtext="Outstanding balance"
            icon={CreditCard}
            className="ui-card-interactive h-full"
          />
        </Link>
        <Link href="/student/exams" className="block rounded-[var(--radius-card)]">
          <StatCard
            label="Upcoming exams"
            value={exams.length}
            subtext="Latest exams for your class"
            icon={FileSpreadsheet}
            className="ui-card-interactive h-full"
          />
        </Link>
        <Link href="/student/homework" className="block rounded-[var(--radius-card)]">
          <StatCard
            label="Homework"
            value={homework.length}
            subtext="Latest assignments"
            icon={BookOpen}
            className="ui-card-interactive h-full"
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Recent attendance" icon={CalendarCheck} href="/student/attendance" linkLabel="Full record">
          {recentAttendance.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No attendance recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentAttendance.map((r) => (
                <li key={r.sessionId + r.date} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-foreground">{formatFriendlyDate(r.date)}</span>
                  <StatusBadge status={r.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="School notices" icon={Megaphone} href="/student/notices">
          {notices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No notices right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notices.map((n) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatFriendlyDate(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{n.content}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="This week" icon={CalendarDays} href="/student/timetable" linkLabel="Timetable">
        <WeeklyTimetable slots={slots} />
      </SectionCard>

      <section aria-labelledby="student-more-links">
        <h2 id="student-more-links" className="section-title mb-3">
          More
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {moreLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="ui-card ui-card-interactive group flex items-center gap-3 p-3.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{link.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{link.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
