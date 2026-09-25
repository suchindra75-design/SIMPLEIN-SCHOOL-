import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { setUserActiveAction } from "@/app/admin/actions";
import { ConfirmButton } from "@/app/admin/_components/forms";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  StatusBadge,
} from "@/app/admin/_components/ui";
import { listUsers } from "@/lib/services/users";
import type { UserDto } from "@/lib/services/dto";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let users: UserDto[] = [];
  let loadError: string | undefined;
  try {
    ({ users } = await listUsers(db, ctx, { page: 1, limit: 100 }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load";
  }

  return (
    <main>
      <PageHeader title="Users & logins" actionHref="/admin/users/new" actionLabel="New login" />
      <ErrorAlert error={loadError} />
      {users.length === 0 ? (
        <EmptyState message="No users yet." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.userRoles.map((r) => r.role).join(", ") || "—"}</td>
                <td>
                  <StatusBadge active={u.isActive} />
                </td>
                <td>
                  {u.id !== ctx.profile.id &&
                    (u.isActive ? (
                      <ConfirmButton
                        label="Disable"
                        confirmMessage={`Disable login for ${u.fullName}?`}
                        run={setUserActiveAction.bind(null, u.id, false)}
                      />
                    ) : (
                      <ConfirmButton
                        label="Enable"
                        confirmMessage={`Enable login for ${u.fullName}?`}
                        run={setUserActiveAction.bind(null, u.id, true)}
                      />
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-sm text-gray-600">
        New logins link to an existing teacher/parent profile in this school.{" "}
        <Link href="/admin/users/new" className="underline">
          Create login
        </Link>
      </p>
    </main>
  );
}
