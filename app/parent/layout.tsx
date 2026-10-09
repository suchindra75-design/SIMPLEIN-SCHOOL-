import { ParentNav } from "@/app/components/ParentNav";
import { ShellHeader } from "@/app/components/ShellHeader";
import { requireDashboard } from "@/lib/auth/dashboard";

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
    <div data-shell="PARENT">
      <ShellHeader
        role="PARENT"
        name={ctx.profile.fullName}
        school={ctx.school}
      />
      <div className="border-b bg-gray-50/50 p-4">
        <ParentNav />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
