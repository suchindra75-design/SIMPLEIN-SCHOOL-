import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

/** Session-aware page — never statically prerendered. */
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Reset your password</h1>
        {sent === "1" ? (
          <div className="mt-4 space-y-3">
            <p
              role="status"
              className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
            >
              If an account matches what you entered, we’ve emailed it a
              password-reset link. The link expires shortly — check your spam
              folder too.
            </p>
            <Link href="/login" className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-500">
              Enter the ID or email you sign in with and we’ll email you a reset link.
            </p>
            <ForgotPasswordForm />
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
