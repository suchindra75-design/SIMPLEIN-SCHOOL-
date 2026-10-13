"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { UserNav } from "@/components/shared/UserNav";
import { NotificationBell } from "@/components/shared/NotificationBell";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Layers,
  FileSpreadsheet,
  Megaphone,
  Bell,
  Menu,
  X,
  School as SchoolIcon,
} from "lucide-react";

const adminNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/teachers", label: "Teachers", icon: GraduationCap },
  { href: "/admin/classes", label: "Classes & Sections", icon: Layers },
  { href: "/admin/exams", label: "Exams & Results", icon: FileSpreadsheet },
  { href: "/admin/notices", label: "Notices & Circulars", icon: Megaphone },
  { href: "/admin/notifications", label: "Notification Centre", icon: Bell },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { school } = useMockStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-zinc-50/75">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-zinc-200 bg-white shrink-0">
        {/* Brand */}
        <div className="h-16 px-5 border-b border-zinc-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-zinc-950 text-white flex items-center justify-center font-bold">
            <SchoolIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-zinc-950 truncate tracking-tight">
              {school.name}
            </h1>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold block font-mono">
              Administration
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-zinc-950 text-white font-semibold shadow-xs"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    active ? "text-white" : "text-zinc-400 group-hover:text-zinc-700"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* School Term Footer */}
        <div className="p-3 border-t border-zinc-200 bg-zinc-50 text-[11px] text-zinc-500 font-mono">
          <div className="font-semibold text-zinc-800">{school.academicYear}</div>
          <div>{school.currentTerm}</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-200 bg-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded-md text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:block">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                Institutional Control Panel
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="h-5 w-px bg-zinc-200" />
            <UserNav />
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 max-w-[80vw] bg-white flex flex-col h-full shadow-2xl">
              <div className="h-16 px-4 border-b border-zinc-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-zinc-950 text-white flex items-center justify-center font-bold">
                    <SchoolIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-zinc-950 truncate">
                    {school.name}
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium ${
                        active
                          ? "bg-zinc-950 text-white font-semibold"
                          : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
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
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
