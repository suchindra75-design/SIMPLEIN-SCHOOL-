"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordResetAction } from "@/app/auth-actions";

type RoleKey = "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";

// Mirrors the login form: the identifier differs per role and the server
// resolves it to the account email.
const ROLES: Record<RoleKey, { label: string; idLabel: string; placeholder: string }> = {
  ADMIN: { label: "Admin", idLabel: "Email", placeholder: "admin@school.edu" },
  TEACHER: { label: "Teacher", idLabel: "Employee ID or email", placeholder: "T-1001 or name@school.edu" },
  PARENT: { label: "Parent", idLabel: "Mobile number or email", placeholder: "98765 43210 or parent@example.com" },
  STUDENT: { label: "Student", idLabel: "Admission number or email", placeholder: "GPS-2026-001 or name@school.edu" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [role, setRole] = useState<RoleKey>("ADMIN");
  const config = ROLES[role];

  return (
    <form action={requestPasswordResetAction} className="mt-5 space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1 text-xs font-medium text-gray-600">
        {(Object.keys(ROLES) as RoleKey[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-md py-1.5 text-center transition-all ${
              role === r ? "bg-white font-semibold text-blue-600 shadow-xs" : "hover:text-gray-900"
            }`}
          >
            {ROLES[r].label}
          </button>
        ))}
      </div>

      <input type="hidden" name="role" value={role} />

      <div>
        <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
          {config.idLabel}
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          required
          placeholder={config.placeholder}
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
