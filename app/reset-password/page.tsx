import Link from "next/link";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

/** Session-aware page — never statically prerendered. */
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // A valid recovery session is established by /auth/callback before we land
  // here. Without it, there is nothing to update.
  let hasSession = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getUser();
      hasSession = data.user !== null;
    } catch {
      hasSession = false;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Set a new password</h1>
        {!hasSession ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <Link href="/forgot-password" className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            {error === "weak" && (
              <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Passwords must match and be at least 8 characters.
              </p>
            )}
            {error === "expired" && (
              <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Your reset link expired before the password was saved. Please request a new one.
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">Choose a new password for your account.</p>
            <ResetPasswordForm />
          </>
        )}
      </div>
    </div>
  );
}
