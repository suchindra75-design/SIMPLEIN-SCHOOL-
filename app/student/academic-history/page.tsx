import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

interface EnrollmentRow {
  academic_year_id: string;
  class_id: string | null;
  section_id: string | null;
  roll_number: string | null;
  status: string;
  academic_years?: { name: string } | null;
  classes?: { name: string } | null;
  sections?: { name: string } | null;
}

/** Student academic history: own enrollment history across years (read-only). */
export default async function StudentAcademicHistoryPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);
  if (scope === null) {
    return (
      <main>
        <h2 className="text-xl font-semibold">Academic history</h2>
        <div className="mt-4">
          <EmptyState message="No student profile is linked to your login yet." />
        </div>
      </main>
    );
  }
  const { data, error } = await db
    .from("student_enrollments")
    .select(
      "academic_year_id, class_id, section_id, roll_number, status, academic_years(name), classes(name), sections(name)",
    )
    .eq("student_id", scope.studentId)
    .eq("school_id", ctx.profile.schoolId)
    .order("created_at", { ascending: false });
  const rows = (error === null ? ((data ?? []) as unknown as EnrollmentRow[]) : []) as EnrollmentRow[];

  return (
    <main>
      <h2 className="text-xl font-semibold">Academic history</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Your enrollment history
      </p>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No enrollment history yet." />
        </div>
      ) : (
        <table className="mt-4 w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2">Year</th>
              <th>Class</th>
              <th>Section</th>
              <th>Roll</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.academic_year_id} className="border-b">
                <td className="py-2">{r.academic_years?.name ?? "—"}</td>
                <td>{r.classes?.name ?? "—"}</td>
                <td>{r.sections?.name ?? "—"}</td>
                <td>{r.roll_number ?? "—"}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-sm">
        <Link href="/student" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
