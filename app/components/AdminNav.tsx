"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/parents", label: "Parents" },
  { href: "/admin/teachers", label: "Teachers" },
  { href: "/admin/classes", label: "Classes" },
  { href: "/admin/subjects", label: "Subjects" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/exams", label: "Exams" },
  { href: "/admin/marks", label: "Marks" },
  { href: "/admin/report-cards", label: "Report Cards" },
  { href: "/admin/timetable", label: "Timetable" },
  { href: "/admin/homework", label: "Homework" },
  { href: "/admin/notices", label: "Notices" },
  { href: "/admin/fees", label: "Fees" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/pyqs", label: "PYQs" },
  { href: "/admin/users", label: "Users" },
  { href: "/notifications", label: "Notifications" },
];

/** School Admin portal navigation (responsive pill links). */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Admin navigation">
      {NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded px-3 py-1.5 transition-colors ${
              active
                ? "bg-blue-600 text-white font-medium shadow-sm"
                : "border bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
