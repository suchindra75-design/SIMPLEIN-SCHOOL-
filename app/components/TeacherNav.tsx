"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/teacher", label: "Dashboard" },
  { href: "/teacher/attendance", label: "Attendance" },
  { href: "/teacher/exams", label: "Exams" },
  { href: "/teacher/marks", label: "Marks" },
  { href: "/teacher/report-cards", label: "Report Cards" },
  { href: "/teacher/homework", label: "Homework" },
  { href: "/teacher/timetable", label: "Timetable" },
  { href: "/teacher/notices", label: "Notices" },
  { href: "/notifications", label: "Notifications" },
];

/** Teacher portal navigation (responsive pill links). */
export function TeacherNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Teacher navigation">
      {NAV.map((item) => {
        const active =
          item.href === "/teacher"
            ? pathname === "/teacher"
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
