import {
  Archive,
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  History,
  LayoutDashboard,
  Layers,
  Library,
  Megaphone,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ShellRole = "SCHOOL_ADMIN" | "TEACHER" | "PARENT" | "STUDENT";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface PortalConfig {
  /** Shell theme: staff portals use ink, family portals use navy. */
  portal: "staff" | "family";
  home: string;
  portalLabel: string;
  roleLabel: string;
  groups: NavGroup[];
}

const notifications: NavItem = {
  href: "/notifications",
  label: "Notifications",
  icon: Bell,
};

/** Navigation per role. Every href is an existing route; access is enforced server-side. */
export const PORTALS: Record<ShellRole, PortalConfig> = {
  SCHOOL_ADMIN: {
    portal: "staff",
    home: "/admin",
    portalLabel: "Administration",
    roleLabel: "Administrator",
    groups: [
      {
        label: "Overview",
        items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
      },
      {
        label: "People",
        items: [
          { href: "/admin/students", label: "Students", icon: Users },
          { href: "/admin/teachers", label: "Teachers", icon: GraduationCap },
          { href: "/admin/parents", label: "Parents", icon: UserCheck },
          { href: "/admin/users", label: "Users & access", icon: UserCog },
        ],
      },
      {
        label: "Academics",
        items: [
          { href: "/admin/classes", label: "Classes & sections", icon: Layers },
          { href: "/admin/subjects", label: "Subjects", icon: Library },
          { href: "/admin/timetable", label: "Timetable", icon: CalendarDays },
          { href: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
          { href: "/admin/homework", label: "Homework", icon: BookOpen },
        ],
      },
      {
        label: "Examinations",
        items: [
          { href: "/admin/exams", label: "Exams", icon: FileSpreadsheet },
          { href: "/admin/marks", label: "Marks", icon: ClipboardList },
          { href: "/admin/report-cards", label: "Report cards", icon: Award },
          { href: "/admin/promotions", label: "Promotions", icon: TrendingUp },
          { href: "/admin/pyqs", label: "Question papers", icon: Archive },
        ],
      },
      {
        label: "Finance & updates",
        items: [
          { href: "/admin/fees", label: "Fees", icon: CreditCard },
          { href: "/admin/notices", label: "Notices", icon: Megaphone },
          notifications,
        ],
      },
    ],
  },
  TEACHER: {
    portal: "staff",
    home: "/teacher",
    portalLabel: "Teacher portal",
    roleLabel: "Teacher",
    groups: [
      {
        label: "Overview",
        items: [{ href: "/teacher", label: "Dashboard", icon: LayoutDashboard }],
      },
      {
        label: "Classroom",
        items: [
          { href: "/teacher/attendance", label: "Attendance", icon: CalendarCheck },
          { href: "/teacher/homework", label: "Homework", icon: BookOpen },
          { href: "/teacher/timetable", label: "My timetable", icon: CalendarDays },
        ],
      },
      {
        label: "Assessment",
        items: [
          { href: "/teacher/marks", label: "Marks entry", icon: ClipboardList },
          { href: "/teacher/exams", label: "Exams", icon: FileSpreadsheet },
          { href: "/teacher/report-cards", label: "Report cards", icon: Award },
        ],
      },
      {
        label: "Updates",
        items: [
          { href: "/teacher/notices", label: "Notices", icon: Megaphone },
          notifications,
        ],
      },
    ],
  },
  PARENT: {
    portal: "family",
    home: "/parent",
    portalLabel: "Parent portal",
    roleLabel: "Parent",
    groups: [
      {
        label: "Overview",
        items: [{ href: "/parent", label: "Dashboard", icon: LayoutDashboard }],
      },
      {
        label: "Learning",
        items: [
          { href: "/parent/attendance", label: "Attendance", icon: CalendarCheck },
          { href: "/parent/homework", label: "Homework", icon: BookOpen },
          { href: "/parent/timetable", label: "Timetable", icon: CalendarDays },
        ],
      },
      {
        label: "Assessment",
        items: [
          { href: "/parent/exams", label: "Exams", icon: FileSpreadsheet },
          { href: "/parent/results", label: "Results", icon: ClipboardList },
          { href: "/parent/report-cards", label: "Report cards", icon: Award },
        ],
      },
      {
        label: "School",
        items: [
          { href: "/parent/fees", label: "Fees", icon: CreditCard },
          { href: "/parent/notices", label: "Notices", icon: Megaphone },
          notifications,
        ],
      },
    ],
  },
  STUDENT: {
    portal: "family",
    home: "/student",
    portalLabel: "Student portal",
    roleLabel: "Student",
    groups: [
      {
        label: "Overview",
        items: [{ href: "/student", label: "Dashboard", icon: LayoutDashboard }],
      },
      {
        label: "Learning",
        items: [
          { href: "/student/timetable", label: "Timetable", icon: CalendarDays },
          { href: "/student/attendance", label: "Attendance", icon: CalendarCheck },
          { href: "/student/homework", label: "Homework", icon: BookOpen },
          { href: "/student/pyqs", label: "Question papers", icon: Archive },
        ],
      },
      {
        label: "Assessment",
        items: [
          { href: "/student/exams", label: "Exams", icon: FileSpreadsheet },
          { href: "/student/results", label: "Results", icon: ClipboardList },
          { href: "/student/report-cards", label: "Report cards", icon: Award },
          { href: "/student/academic-history", label: "Academic history", icon: History },
        ],
      },
      {
        label: "School",
        items: [
          { href: "/student/fees", label: "Fees", icon: CreditCard },
          { href: "/student/notices", label: "Notices", icon: Megaphone },
          notifications,
        ],
      },
    ],
  },
};

/** Exact match for portal homes, prefix match for sections. */
export function isActivePath(pathname: string, href: string, home: string): boolean {
  if (href === home) return pathname === home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Label lookup for breadcrumbs. */
export function labelForPath(config: PortalConfig, href: string): string | null {
  for (const group of config.groups) {
    for (const item of group.items) {
      if (item.href === href) return item.label;
    }
  }
  return null;
}
