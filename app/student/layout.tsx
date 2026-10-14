import { requireDashboard } from "@/lib/auth/dashboard";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";

/** Authenticated shell — never statically prerendered (session required). */
export const dynamic = "force-dynamic";

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
    <AppShell
      role="STUDENT"
      schoolName={ctx.school.name}
      userName={ctx.profile.fullName}
      contextLine={contextLine}
    >
      {children}
    </AppShell>
  );
}
