"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  Award,
  BookOpen,
  Calendar,
  Megaphone,
  Bell,
  CreditCard,
  Menu,
  X,
  Users,
} from "lucide-react";

interface ParentSidebarProps {
  schoolName: string;
}

const parentNavItems = [
  { href: "/parent", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parent/attendance", label: "Child Attendance", icon: CalendarCheck },
  { href: "/parent/results", label: "Exam Results", icon: Award },
  { href: "/parent/homework", label: "Homework", icon: BookOpen },
  { href: "/parent/fees", label: "Fee Records", icon: CreditCard },
  { href: "/parent/timetable", label: "Timetable", icon: Calendar },
  { href: "/parent/notices", label: "Circulars", icon: Megaphone },
  { href: "/notifications", label: "Notification Centre", icon: Bell },
];

export function ParentSidebar({ schoolName }: ParentSidebarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-[#DCDCE0] bg-[#E7E7E9] shrink-0">
        {/* Brand */}
        <div className="h-16 px-5 border-b border-[#DCDCE0] bg-[#E7E7E9] flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#191919] text-white flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-[#191919] truncate tracking-tight">
              {schoolName}
            </h1>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold block font-mono">
              Guardian Portal
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {parentNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/parent"
                ? pathname === "/parent"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium nav-item-interactive ${
                  active
                    ? "bg-[#191919] text-white font-semibold shadow-xs"
                    : "text-[#48484A] hover:text-[#191919] hover:bg-[#DCDCE0]/70"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors duration-150 ${
                    active ? "text-white" : "text-[#6E6E73] group-hover:text-[#191919]"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* School Term Footer */}
        <div className="p-3 border-t border-[#DCDCE0] bg-[#E7E7E9] text-[11px] text-zinc-500 font-mono">
          <div className="font-semibold text-zinc-800">Family Gateway</div>
          <div>Scholar Supervision Terminal</div>
        </div>
      </aside>

      {/* Mobile Toggle Trigger */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1.5 rounded-md text-zinc-700 hover:text-zinc-950 hover:bg-[#E7E7E9] btn-interactive"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Navigation Drawer with Smooth Slide & Backdrop Transition */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Parent Navigation Menu"
          className={`fixed inset-0 z-50 flex transition-[visibility] duration-200 ${
            mobileMenuOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
          }`}
          aria-hidden={!mobileMenuOpen}
        >
          <div
            aria-hidden="true"
            className={`fixed inset-0 bg-black/40 backdrop-blur-xs drawer-backdrop transition-opacity duration-200 ease-out ${
              mobileMenuOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className={`relative w-72 max-w-[80vw] bg-[#E7E7E9] flex flex-col h-full shadow-2xl z-10 border-r border-[#DCDCE0] drawer-animated transform transition-transform duration-220 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-16 px-4 border-b border-[#DCDCE0] bg-[#E7E7E9] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[#191919] text-white flex items-center justify-center font-bold">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-[#191919] truncate">
                  {schoolName}
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-800 btn-interactive"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {parentNavItems.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/parent"
                    ? pathname === "/parent"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium nav-item-interactive ${
                      active
                        ? "bg-[#191919] text-white font-semibold"
                        : "text-[#48484A] hover:text-[#191919] hover:bg-[#DCDCE0]/70"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </>
  );
}
