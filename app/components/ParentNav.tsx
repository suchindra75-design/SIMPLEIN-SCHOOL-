"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/parent", label: "Dashboard" },
  { href: "/parent/attendance", label: "Attendance" },
  { href: "/parent/exams", label: "Exams" },
  { href: "/parent/results", label: "Results" },
  { href: "/parent/report-cards", label: "Report Cards" },
  { href: "/parent/timetable", label: "Timetable" },
  { href: "/parent/homework", label: "Homework" },
  { href: "/parent/notices", label: "Notices" },
  { href: "/parent/fees", label: "Fees" },
  { href: "/notifications", label: "Notifications" },
];

/** Parent portal navigation (responsive pill links). */
export function ParentNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Parent navigation">
      {NAV.map((item) => {
        const active =
          item.href === "/parent"
            ? pathname === "/parent"
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
