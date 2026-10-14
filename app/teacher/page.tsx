import React from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTeacherScope, listTeacherSections } from "@/lib/services/teachers";
import { listHomework } from "@/lib/services/homework";
import { listExams } from "@/lib/services/exams";
import { StatCard } from "@/components/shared/StatCard";
import { SectionCard } from "@/app/admin/_components/ui";
import { formatFriendlyDate } from "@/lib/domain";
import {
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  Layers,
  Megaphone,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

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
    { label: "Attendance", href: "/teacher/attendance", desc: "Mark today's attendance", icon: CalendarCheck },
    { label: "Marks entry", href: "/teacher/marks", desc: "Enter exam scores", icon: ClipboardList },
    { label: "Homework", href: "/teacher/homework", desc: "Assign and manage homework", icon: BookOpen },
    { label: "Exams", href: "/teacher/exams", desc: "Class exam schedules", icon: FileSpreadsheet },
    { label: "Report cards", href: "/teacher/report-cards", desc: "Review student reports", icon: Award },
    { label: "My timetable", href: "/teacher/timetable", desc: "Your weekly schedule", icon: CalendarDays },
    { label: "Notices", href: "/teacher/notices", desc: "School announcements", icon: Megaphone },
    { label: "Notifications", href: "/notifications", desc: "Alerts and messages", icon: Bell },
  ];

  const firstName = ctx.profile.fullName.split(" ")[0] ?? ctx.profile.fullName;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <p className="page-description">
            {sections.length > 0
              ? `You teach ${sections.length} section${sections.length === 1 ? "" : "s"} at ${ctx.school.name}.`
              : `No teaching sections are assigned to you at ${ctx.school.name} yet.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/teacher/marks" className="ui-btn ui-btn-secondary">
            <ClipboardList aria-hidden="true" className="size-4" />
            Marks entry
          </Link>
          <Link href="/teacher/attendance" className="ui-btn ui-btn-primary">
            <CalendarCheck aria-hidden="true" className="size-4" />
            Take attendance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="My sections" value={sections.length} subtext="Classes you teach" icon={Layers} />
        <StatCard label="Upcoming exams" value={exams.length} subtext="Latest exams for your classes" icon={FileSpreadsheet} />
        <StatCard label="Recent homework" value={homeworkList.length} subtext="Latest assignments" icon={BookOpen} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="My classes" icon={Layers} href="/teacher/attendance" linkLabel="Attendance">
          {scope === null ? (
            <div className="ui-alert ui-alert-warning">
              No teacher profile is linked to your login yet. Contact your school administrator.
            </div>
          ) : sections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No classes assigned yet. Your school administrator can link classes to you.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {sections.map((sec) => (
                <li key={sec.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {sec.classes?.name ?? "Class"} · Section {sec.name}
                    </span>
                    {sec.room ? (
                      <span className="block text-xs text-muted-foreground">Room {sec.room}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <Link href="/teacher/attendance" className="ui-btn ui-btn-ghost ui-btn-sm">Attendance</Link>
                    <Link href="/teacher/marks" className="ui-btn ui-btn-ghost ui-btn-sm">Marks</Link>
                    <Link href="/teacher/homework" className="ui-btn ui-btn-ghost ui-btn-sm">Homework</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent homework" icon={BookOpen} href="/teacher/homework" linkLabel="Manage">
          {homeworkList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No homework assigned yet. Create one from the Homework page.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {homeworkList.slice(0, 4).map((hw) => (
                <li key={hw.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{hw.title}</span>
                    <span className="ui-badge ui-badge-neutral shrink-0">{hw.classes?.name ?? "Class"}</span>
                  </div>
                  {hw.description ? (
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{hw.description}</p>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Due {formatFriendlyDate(hw.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section aria-labelledby="teacher-quick-actions">
        <h2 id="teacher-quick-actions" className="section-title mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
