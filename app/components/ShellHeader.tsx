import { LogoutButton } from "@/app/components/LogoutButton";
import type { AppRole } from "@/lib/auth/rbac";
import type { School } from "@/lib/auth/session";

interface ShellHeaderProps {
  role: AppRole;
  name: string;
  school: School;
  nav?: string[];
}

/** Shared authenticated shell header: who is signed in, where, as what. */
export function ShellHeader({ role, name, school }: ShellHeaderProps) {
  return (
    <header className="border-b bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{school.name}</h1>
          <p className="text-sm text-gray-600">
            {name} · <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{role}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
