import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listClasses } from "@/lib/services/classes";
import { listParents } from "@/lib/services/parents";
import { listStudents } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const [{ total: students }, { total: teachers }, { total: parents }, { classes }] =
    await Promise.all([
      listStudents(db, ctx, { page: 1, limit: 1 }),
      listTeachers(db, ctx, { page: 1, limit: 1 }),
      listParents(db, ctx, { page: 1, limit: 1 }),
      listClasses(db, ctx),
    ]);

  const cards = [
    { label: "Students", count: students, href: "/admin/students" },
    { label: "Teachers", count: teachers, href: "/admin/teachers" },
    { label: "Parents", count: parents, href: "/admin/parents" },
    { label: "Classes", count: classes.length, href: "/admin/classes" },
  ];

  return (
    <main>
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded border p-4 hover:bg-gray-50"
          >
            <p className="text-2xl font-bold">{c.count}</p>
            <p className="text-sm text-gray-600">{c.label}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 text-sm">
        <Link href="/admin/users" className="underline">
          Users & logins
        </Link>{" "}
        ·{" "}
        <Link href="/admin/subjects" className="underline">
          Subjects
        </Link>{" "}
        ·{" "}
        <Link href="/admin/students/import" className="underline">
          Import students
        </Link>
      </div>
    </main>
  );
}
