import React from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { listNotices } from "@/lib/services/notices";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatFriendlyDate } from "@/lib/domain";
import {
  Users,
  CalendarCheck,
  Award,
  CreditCard,
  Megaphone,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const scope = await getParentScope(db, ctx);
  const sp = await searchParams;

  const { children } =
    scope === null
      ? { children: [] }
      : await listChildren(db, ctx, scope.parentId).catch(() => ({ children: [] }));
  const activeChild =
    children.find((c) => c.id === sp.child) ?? children[0] ?? null;

  const noticesResult = await listNotices(db, ctx, {
    page: 1,
    limit: 5,
  }).catch(() => ({ notices: [], total: 0 }));

  const quickActions = [
    { label: "Child Attendance", href: "/parent/attendance", desc: "Daily attendance logs & monthly summary" },
    { label: "Homework & Tasks", href: "/parent/homework", desc: "Pending & submitted assignments" },
    { label: "Exam Results", href: "/parent/results", desc: "Subject scores & grade assessments" },
    { label: "Report Cards", href: "/parent/report-cards", desc: "Official term report cards" },
    { label: "Fee Records", href: "/parent/fees", desc: "Fee dues, payments & receipts" },
    { label: "Class Timetable", href: "/parent/timetable", desc: "Weekly period schedule" },
    { label: "School Circulars", href: "/parent/notices", desc: "Official school notices & updates" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-zinc-950 text-white flex items-center justify-center font-bold text-xl font-mono shrink-0">
            {activeChild
              ? activeChild.displayName.slice(0, 2).toUpperCase()
              : "GP"}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-zinc-950">
                {activeChild ? activeChild.displayName : ctx.profile.fullName}
              </h1>
              <StatusBadge status="ACTIVE" size="sm" />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              {activeChild
                ? `${activeChild.classes?.name ?? "Class"} • ${activeChild.sections?.name ?? "Section"} • Roll: ${activeChild.rollNumber ?? "Enrolled"}`
                : "Guardian Portal Account"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/parent/attendance"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#191919] bg-[#F8F8F9] hover:bg-[#E7E7E9] border border-[#DCDCE0] rounded-md shadow-xs btn-interactive"
          >
            <CalendarCheck className="w-3.5 h-3.5 text-[#191919]" />
            Attendance
          </Link>
          <Link
            href="/parent/results"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#191919] hover:bg-[#2D2D30] rounded-md shadow-xs btn-interactive"
          >
            <Award className="w-3.5 h-3.5" />
            Exam Results
          </Link>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Linked Children"
          value={children.length}
          subtext="Enrolled students"
          icon={Users}
        />
        <Link href="/parent/attendance" className="block">
          <StatCard
            label="Attendance Tracking"
            value="Active"
            subtext="Daily roll call logs"
            icon={CalendarCheck}
          />
        </Link>
        <Link href="/parent/results" className="block">
          <StatCard
            label="Academic Reports"
            value="Published"
            subtext="Term report cards"
            icon={Award}
          />
        </Link>
        <Link href="/parent/fees" className="block">
          <StatCard
            label="Fee Records"
            value="Structures"
            subtext="Due & paid receipts"
            icon={CreditCard}
          />
        </Link>
      </div>

      {/* Operational Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Linked Children Roster */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                My Children
              </h2>
            </div>
            <span className="text-xs text-[#6E6E73] font-mono">
              {children.length} student{children.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {scope === null ? (
              <div className="rounded-lg border border-dashed border-amber-300 p-6 text-center text-xs text-amber-800 bg-amber-50/50">
                No parent profile is linked to your login yet. Contact your school administrator.
              </div>
            ) : children.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No students linked to this parent login. Contact administration.
              </p>
            ) : (
              children.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded bg-[#E7E7E9]/50 border border-[#DCDCE0] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[#191919]">
                        {c.displayName}
                      </h3>
                      <p className="text-[11px] text-[#6E6E73] font-mono">
                        Admission No: {c.admissionNo} • {c.classes?.name ?? "Class"} {c.sections?.name ?? ""} • Roll: {c.rollNumber ?? "—"}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Active
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#DCDCE0]/50 text-xs font-mono">
                    <Link
                      href={`/parent/attendance?studentId=${c.id}`}
                      className="text-[#191919] hover:underline font-medium"
                    >
                      Attendance
                    </Link>
                    <span className="text-[#DCDCE0]">•</span>
                    <Link
                      href={`/parent/results?studentId=${c.id}`}
                      className="text-[#191919] hover:underline font-medium"
                    >
                      Results
                    </Link>
                    <span className="text-[#DCDCE0]">•</span>
                    <Link
                      href={`/parent/report-cards?studentId=${c.id}`}
                      className="text-[#191919] hover:underline font-medium"
                    >
                      Report Cards
                    </Link>
                    <span className="text-[#DCDCE0]">•</span>
                    <Link
                      href={`/parent/timetable?studentId=${c.id}`}
                      className="text-[#191919] hover:underline font-medium"
                    >
                      Timetable
                    </Link>
                    <span className="text-[#DCDCE0]">•</span>
                    <Link
                      href={`/parent/homework?studentId=${c.id}`}
                      className="text-[#191919] hover:underline font-medium"
                    >
                      Homework
                    </Link>
                    <span className="text-[#DCDCE0]">•</span>
                    <Link
                      href={`/parent/fees?studentId=${c.id}`}
                      className="text-[#191919] hover:underline font-medium"
                    >
                      Fees
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Circulars for Parents */}
        <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#DCDCE0]/70">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#191919]" />
              <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono">
                School Circulars & Notices
              </h2>
            </div>
            <Link
              href="/parent/notices"
              className="text-xs text-[#191919] hover:underline font-semibold font-mono"
            >
              All Notices →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[#DCDCE0]/70">
            {noticesResult.notices.length === 0 ? (
              <p className="text-xs text-[#6E6E73] py-6 text-center">
                No active circulars.
              </p>
            ) : (
              noticesResult.notices.slice(0, 3).map((n) => (
                <div key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#191919] truncate">
                      {n.title}
                    </span>
                    <span className="text-[10px] text-[#6E6E73] font-mono">
                      {formatFriendlyDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#48484A] mt-1 line-clamp-2">
                    {n.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] p-5 shadow-xs">
        <h2 className="text-xs font-bold text-[#191919] uppercase tracking-wider font-mono mb-3">
          Quick Portal Navigation
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
