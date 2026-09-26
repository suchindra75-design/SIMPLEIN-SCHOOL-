"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/attendance", label: "Attendance" },
  { href: "/student/timetable", label: "Timetable" },
  { href: "/student/homework", label: "Homework" },
  { href: "/student/exams", label: "Exams" },
  { href: "/student/results", label: "Results" },
  { href: "/student/report-cards", label: "Report Cards" },
  { href: "/student/notices", label: "Notices" },
  { href: "/student/fees", label: "Fees" },
  { href: "/student/pyqs", label: "PYQs" },
  { href: "/student/academic-history", label: "History" },
  { href: "/notifications", label: "Notifications" },
];

/** Student portal navigation (mobile-friendly). */
export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Student portal">
      {NAV.map((item) => {
        const active =
          item.href === "/student"
            ? pathname === "/student"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded px-3 py-1.5 ${
              active ? "bg-blue-600 text-white" : "border hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
