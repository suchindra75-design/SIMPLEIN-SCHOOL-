"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { UserNav } from "@/components/shared/UserNav";
import { NotificationBell } from "@/components/shared/NotificationBell";
import {
  LayoutDashboard,
  CalendarCheck,
  Award,
  BookOpen,
  Megaphone,
  School as SchoolIcon,
} from "lucide-react";

const studentNavItems = [
  { href: "/student/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/student/attendance", label: "My Attendance", icon: CalendarCheck },
  { href: "/student/results", label: "Report Card", icon: Award },
  { href: "/student/homework", label: "Homework & Tasks", icon: BookOpen },
  { href: "/student/notices", label: "School Notices", icon: Megaphone },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { school, currentPersona } = useMockStore();

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50/75 selection:bg-zinc-900 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Left: Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-zinc-950 text-white flex items-center justify-center font-bold">
                <SchoolIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xs font-bold text-zinc-950 tracking-tight">
                    {school.name}
                  </h1>
                  <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-100 text-zinc-900 border border-zinc-300 uppercase">
                    Scholar
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 hidden sm:block">
                  {currentPersona.name} • {currentPersona.title}
                </p>
              </div>
            </div>

            {/* Right: Notifications & Profile/SignOut */}
            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="h-5 w-px bg-zinc-200" />
              <UserNav />
            </div>
          </div>

          {/* Desktop Tab Navigation */}
          <nav className="hidden sm:flex space-x-1 border-t border-zinc-100 py-1 overflow-x-auto">
            {studentNavItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/student/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "bg-zinc-900 text-white font-semibold"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="sm:hidden border-t border-zinc-200 bg-zinc-50 px-2 py-1 flex items-center justify-around overflow-x-auto">
          {studentNavItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`p-2 rounded text-[10px] flex flex-col items-center gap-1 ${
                  active ? "text-zinc-950 font-bold" : "text-zinc-500"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-[55px]">{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Page Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-zinc-200 bg-white py-4 text-center text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            {school.name} • Student Information & Learning Portal
          </span>
          <div className="flex items-center gap-3">
            <span>Academic Year {school.academicYear}</span>
            <span>•</span>
            <Link href="/" className="hover:underline text-zinc-900">
              School Website
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
