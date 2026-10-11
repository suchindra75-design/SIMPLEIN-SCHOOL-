import { requireDashboard } from "@/lib/auth/dashboard";
import { ParentSidebar } from "@/components/navigation/ParentSidebar";
import { UserNav } from "@/components/shared/UserNav";
import { NotificationBell } from "@/components/shared/NotificationBell";

/** Authenticated shell — never statically prerendered (session required). */
export const dynamic = "force-dynamic";

/** Parent shell. Server-enforced requireRole(PARENT). */
export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireDashboard("PARENT", "/parent");

  return (
    <div data-shell="PARENT" className="min-h-screen flex bg-[#F1F1F2]">
      {/* Parent Sidebar */}
      <ParentSidebar schoolName={ctx.school.name} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-[#DCDCE0] bg-[#F8F8F9] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 hidden sm:inline">
              Guardian Portal & Scholar Academics
            </span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell notificationHref="/notifications" />
            <div className="h-5 w-px bg-[#DCDCE0]" />
            <UserNav
              name={ctx.profile.fullName}
              role="Guardian"
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
