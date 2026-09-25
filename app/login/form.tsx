"use client";

import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/auth-actions";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Invalid email or password.",
  disabled: "This account is disabled or not provisioned. Contact your school.",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ error }: { error?: string }) {
  return (
    <form action={loginAction} className="mt-6 space-y-4">
      {error !== undefined && ERROR_MESSAGES[error] !== undefined && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {ERROR_MESSAGES[error]}
        </p>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>
      <SubmitButton />
    </form>
  );
}
