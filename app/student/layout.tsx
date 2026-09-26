import { ShellHeader } from "@/app/components/ShellHeader";
import { StudentNav } from "@/app/components/StudentNav";
import { requireDashboard } from "@/lib/auth/dashboard";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Student portal shell. Server-enforced requireRole(STUDENT); every API route
 * re-enforces self-only scope + tenant isolation independently.
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireDashboard("STUDENT", "/student");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);
  let contextLine: string | null = null;
  if (scope !== null) {
    const { data, error } = await db
      .from("students")
      .select("classes(name), sections(name)")
      .eq("id", scope.studentId)
      .single();
    if (error === null && data !== null) {
      const row = data as unknown as {
        classes?: { name: string } | null;
        sections?: { name: string } | null;
      };
      contextLine = `${row.classes?.name ?? ""} ${row.sections?.name ?? ""}`.trim();
    }
  }
  return (
    <div data-shell="STUDENT">
      <ShellHeader
        role="STUDENT"
        name={ctx.profile.fullName}
        school={ctx.school}
        nav={[]}
      />
      <div className="border-b p-4">
        <StudentNav />
        {scope === null ? (
          <p className="mt-3 text-sm text-amber-700">
            No student profile is linked to your login yet. Contact your school
            administrator.
          </p>
        ) : (
          <p className="mt-3 text-xs text-gray-600">
            {contextLine !== null && contextLine !== "" ? contextLine : "Enrolled"}
          </p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
