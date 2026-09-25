import { LogoutButton } from "@/app/components/LogoutButton";
import type { AppRole } from "@/lib/auth/rbac";
import type { School } from "@/lib/auth/session";

interface ShellHeaderProps {
  role: AppRole;
  name: string;
  school: School;
  nav: string[];
}

/** Shared authenticated shell header: who is signed in, where, as what. */
export function ShellHeader({ role, name, school, nav }: ShellHeaderProps) {
  return (
    <header className="border-b p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold">{school.name}</h1>
          <p className="text-sm text-gray-600">
            {name} · {role}
          </p>
        </div>
        <LogoutButton />
      </div>
      <nav className="mt-3 flex gap-4 text-sm text-gray-600" aria-label="Modules">
        {nav.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </nav>
    </header>
  );
}
