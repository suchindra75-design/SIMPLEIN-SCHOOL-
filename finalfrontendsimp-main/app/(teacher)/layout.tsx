"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { UserNav } from "@/components/shared/UserNav";
import { NotificationBell } from "@/components/shared/NotificationBell";
import {
  LayoutDashboard,
  ClipboardCheck,
  FileSpreadsheet,
  BookOpen,
  Bell,
  School as SchoolIcon,
} from "lucide-react";

const teacherNavItems = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/teacher/marks", label: "Marks Entry", icon: FileSpreadsheet },
  { href: "/teacher/homework", label: "Homework", icon: BookOpen },
  { href: "/teacher/notifications", label: "Notifications", icon: Bell },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { school, currentPersona } = useMockStore();

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50/75">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            {/* Left: Brand & Persona */}
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
                    Faculty
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 hidden sm:block">
                  {currentPersona.name} • {currentPersona.title}
                </p>
              </div>
            </div>

            {/* Right: Notification & Switcher */}
            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="h-5 w-px bg-zinc-200" />
              <UserNav />
            </div>
          </div>

          {/* Desktop Tab Navigation */}
          <nav className="hidden sm:flex space-x-1 border-t border-zinc-100 py-1 overflow-x-auto">
            {teacherNavItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/teacher/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? "bg-zinc-950 text-white font-semibold shadow-xs"
                      : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      active ? "text-white" : "text-zinc-400"
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Page Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 mb-16 sm:mb-0">
        {children}
      </main>

      {/* Mobile Bottom Bar for Teachers */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 z-40 flex items-center justify-around py-2 px-1">
        {teacherNavItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/teacher/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 p-1 text-[10px] font-medium ${
                active ? "text-zinc-950 font-bold" : "text-zinc-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
