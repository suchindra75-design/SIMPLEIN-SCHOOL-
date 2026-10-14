import React from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { listNotices } from "@/lib/services/notices";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/app/admin/_components/ui";
import { formatFriendlyDate } from "@/lib/domain";
import {
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  Megaphone,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const [[scope, noticesResult], sp] = await Promise.all([
    Promise.all([
      getParentScope(db, ctx),
      listNotices(db, ctx, {
        page: 1,
        limit: 5,
      }).catch(() => ({ notices: [], total: 0 })),
    ]),
    searchParams,
  ]);

  const { children } =
    scope === null
      ? { children: [] }
      : await listChildren(db, ctx, scope.parentId).catch(() => ({ children: [] }));
  const activeChild =
    children.find((c) => c.id === sp.child) ?? children[0] ?? null;

  const quickActions = [
    { label: "Attendance", href: "/parent/attendance", desc: "Daily attendance and summary", icon: CalendarCheck },
    { label: "Homework", href: "/parent/homework", desc: "Assignments and due dates", icon: BookOpen },
    { label: "Exams", href: "/parent/exams", desc: "Upcoming exam schedule", icon: FileSpreadsheet },
    { label: "Results", href: "/parent/results", desc: "Published subject results", icon: ClipboardList },
    { label: "Report cards", href: "/parent/report-cards", desc: "Term report cards", icon: Award },
    { label: "Timetable", href: "/parent/timetable", desc: "Weekly class schedule", icon: CalendarDays },
    { label: "Fees", href: "/parent/fees", desc: "Dues, payments and receipts", icon: CreditCard },
    { label: "Notices", href: "/parent/notices", desc: "School announcements", icon: Megaphone },
  ];

  const childQuery = activeChild ? `?studentId=${activeChild.id}` : "";
  const firstName = ctx.profile.fullName.split(" ")[0] ?? ctx.profile.fullName;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <p className="page-description">
            {activeChild
              ? `Viewing ${activeChild.displayName} · ${activeChild.classes?.name ?? "Class"} ${activeChild.sections?.name ?? ""}`.trim()
              : `Parent portal for ${ctx.school.name}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/parent/attendance${childQuery}`} className="ui-btn ui-btn-secondary">
            <CalendarCheck aria-hidden="true" className="size-4" />
            Attendance
          </Link>
          <Link href={`/parent/results${childQuery}`} className="ui-btn ui-btn-primary">
            <ClipboardList aria-hidden="true" className="size-4" />
            Results
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Linked children"
          value={children.length}
          subtext="Students on your account"
          icon={Users}
        />
        {[
          { href: `/parent/attendance${childQuery}`, label: "Attendance", desc: "Daily records", icon: CalendarCheck },
          { href: `/parent/report-cards${childQuery}`, label: "Report cards", desc: "Term reports", icon: Award },
          { href: `/parent/fees${childQuery}`, label: "Fees", desc: "Dues and receipts", icon: CreditCard },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="ui-card ui-card-interactive group flex items-center gap-3 p-5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{card.label}</span>
                <span className="block text-xs text-muted-foreground">{card.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="My children" icon={Users}>
          {scope === null ? (
            <div className="ui-alert ui-alert-warning">
              No parent profile is linked to your login yet. Contact your school administrator.
            </div>
          ) : children.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No students are linked to your account yet. Contact the school office.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {children.map((c) => (
                <li key={c.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground"
                      >
                        {c.displayName.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{c.displayName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.classes?.name ?? "Class"} {c.sections?.name ?? ""} · Adm. {c.admissionNo}
                          {c.rollNumber ? ` · Roll ${c.rollNumber}` : ""}
                        </span>
                      </span>
                    </div>
                    <StatusBadge status={c.status} size="sm" className="shrink-0" />
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1 pl-12">
                    {[
                      ["Attendance", "attendance"],
                      ["Results", "results"],
                      ["Report cards", "report-cards"],
                      ["Timetable", "timetable"],
                      ["Homework", "homework"],
                      ["Fees", "fees"],
                    ].map(([label, path]) => (
                      <Link
                        key={path}
                        href={`/parent/${path}?studentId=${c.id}`}
                        className="ui-btn ui-btn-ghost ui-btn-sm"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="School notices" icon={Megaphone} href="/parent/notices">
          {noticesResult.notices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No notices right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {noticesResult.notices.slice(0, 3).map((n) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatFriendlyDate(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.content}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section aria-labelledby="parent-quick-actions">
        <h2 id="parent-quick-actions" className="section-title mb-3">
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
