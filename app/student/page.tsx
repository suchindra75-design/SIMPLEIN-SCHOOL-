import { redirect } from "next/navigation";
import { LogoutButton } from "@/app/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth/session";

/** Session-aware page — never statically prerendered. */
export const dynamic = "force-dynamic";

/**
 * Controlled dormant-role page. STUDENT exists in the authorization model
 * but has no V1 dashboard — students land here instead of a fake experience.
 */
export default async function StudentPage() {
  const ctx = await getCurrentUser();
  if (ctx === null) {
    redirect("/login?next=%2Fstudent");
  }
  if (!ctx.roles.includes("STUDENT")) {
    redirect("/login");
  }
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Student access is not available yet</h1>
      <p className="mt-2 text-sm text-gray-600">
        {ctx.profile.fullName}, your account ({ctx.school.name}) is recognized,
        but the student dashboard is outside V1 scope. Parents and teachers can
        reach everything you need through their dashboards.
      </p>
      <div className="mt-6 flex justify-center">
        <LogoutButton />
      </div>
    </main>
  );
}
