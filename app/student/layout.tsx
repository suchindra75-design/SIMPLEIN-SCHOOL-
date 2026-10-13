import { requireDashboard } from "@/lib/auth/dashboard";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StudentSidebar } from "@/components/navigation/StudentSidebar";
import { UserNav } from "@/components/shared/UserNav";

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
    <div data-shell="STUDENT" className="min-h-screen flex bg-[#F1F1F2]">
      {/* Student Sidebar */}
      <StudentSidebar schoolName={ctx.school.name} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-[#DCDCE0] bg-[#F8F8F9] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 hidden sm:inline">
              {contextLine ? `${contextLine} • ` : ""}Scholar Terminal
            </span>
          </div>

          <div className="flex items-center gap-3">
            <UserNav
              name={ctx.profile.fullName}
              role="Scholar"
              schoolName={ctx.school.name}
            />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto page-enter">
          {children}
        </main>
      </div>
    </div>
  );
}
