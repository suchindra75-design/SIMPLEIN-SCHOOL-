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
import { SectionCard } from "@/app/admin/_components/ui";
import { formatFriendlyDate } from "@/lib/domain";
import {
  Archive,
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Megaphone,
  TrendingUp,
  Upload,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

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
    { label: "Attendance", href: "/admin/attendance", desc: "Daily class attendance", icon: CalendarCheck },
    { label: "Exams & schedules", href: "/admin/exams", desc: "Plan exams and subjects", icon: FileSpreadsheet },
    { label: "Marks & locking", href: "/admin/marks", desc: "Review, lock and publish", icon: ClipboardList },
    { label: "Report cards", href: "/admin/report-cards", desc: "Generate and share PDFs", icon: Award },
    { label: "Fees", href: "/admin/fees", desc: "Structures, dues and receipts", icon: CreditCard },
    { label: "Timetable", href: "/admin/timetable", desc: "Weekly section schedules", icon: CalendarDays },
    { label: "Homework", href: "/admin/homework", desc: "Assignments and attachments", icon: BookOpen },
    { label: "Notices", href: "/admin/notices", desc: "Publish school notices", icon: Megaphone },
    { label: "Promotions", href: "/admin/promotions", desc: "Move students to the next year", icon: TrendingUp },
    { label: "Question papers", href: "/admin/pyqs", desc: "Previous year papers", icon: Archive },
    { label: "Users & access", href: "/admin/users", desc: "Logins and role grants", icon: UserCog },
    { label: "Import students", href: "/admin/students/import", desc: "Bulk upload from Excel", icon: Upload },
  ];

  const kpis = [
    { label: "Students", value: studentCount, subtext: "Enrolled student profiles", icon: Users, href: "/admin/students" },
    { label: "Teachers", value: teacherCount, subtext: "Teaching staff", icon: GraduationCap, href: "/admin/teachers" },
    { label: "Parents", value: parentCount, subtext: "Parent portal accounts", icon: UserCheck, href: "/admin/parents" },
    { label: "Classes", value: classes.length, subtext: "Configured classes", icon: Layers, href: "/admin/classes" },
  ];

  const firstName = ctx.profile.fullName.split(" ")[0] ?? ctx.profile.fullName;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">
            Welcome back, {firstName}. Here is an overview of {ctx.school.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/students" className="ui-btn ui-btn-secondary">
            <Users aria-hidden="true" className="size-4" />
            Students
          </Link>
          <Link href="/admin/exams" className="ui-btn ui-btn-primary">
            <FileSpreadsheet aria-hidden="true" className="size-4" />
            Exams & results
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.href} href={kpi.href} className="block rounded-[var(--radius-card)]">
            <StatCard
              label={kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              icon={kpi.icon}
              className="ui-card-interactive h-full"
            />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Active exams" icon={FileSpreadsheet} href="/admin/exams" linkLabel="Manage">
          {activeExams.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active exams yet. Create one from the Exams page.
            </p>
          ) : (
            <ul className="-mx-2 divide-y divide-border">
              {activeExams.slice(0, 5).map((exam) => (
                <li key={exam.id}>
                  <Link
                    href={`/admin/exams/${exam.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{exam.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {exam.classes?.name ?? "All classes"} · {formatFriendlyDate(exam.startsOn)}
                      </span>
                    </span>
                    <StatusBadge status={exam.isActive ? "ACTIVE" : "INACTIVE"} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent notices" icon={Megaphone} href="/admin/notices">
          {recentNotices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No notices published yet. Create one from the Notices page.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recentNotices.map((notice) => (
                <li key={notice.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{notice.title}</span>
                    <StatusBadge status={notice.category ?? "GENERAL"} size="sm" className="shrink-0" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{notice.content}</p>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatFriendlyDate(notice.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="section-title mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="ui-card ui-card-interactive group flex items-center gap-3 p-3.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{action.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{action.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
