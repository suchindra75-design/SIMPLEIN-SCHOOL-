import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/form";
import { getCurrentUser, roleHome } from "@/lib/auth/session";

/** Session-aware page — never statically prerendered. */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  // Already signed in → send to the role dashboard (validates session too:
  // disabled/unprovisioned accounts fall through to the form with an error).
  try {
    const ctx = await getCurrentUser();
    if (ctx !== null) {
      redirect(params.next ?? roleHome(ctx.roles));
    }
  } catch {
    // Inactive/unprovisioned: show the login form with an explanatory error.
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold">SIMPLEIN SCHOOL ERP</h1>
      <p className="mt-1 text-sm text-gray-600">Sign in to your school account</p>
      <LoginForm error={params.error} />
    </main>
  );
}
