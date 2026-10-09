"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/auth-actions";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Invalid credentials. Please verify your identifier and password.",
  disabled: "This account is disabled or not provisioned. Contact your school administrator.",
};

type RoleTab = "STUDENT" | "PARENT" | "TEACHER" | "ADMIN";

const ROLE_CONFIG: Record<
  RoleTab,
  {
    label: string;
    identifierLabel: string;
    placeholder: string;
    type: string;
    helperText: string;
  }
> = {
  STUDENT: {
    label: "Student",
    identifierLabel: "Admission Number",
    placeholder: "e.g. S-2026-001",
    type: "text",
    helperText: "Enter your school admission number",
  },
  PARENT: {
    label: "Parent",
    identifierLabel: "Mobile Number",
    placeholder: "e.g. 9876543210",
    type: "tel",
    helperText: "Enter your registered 10-digit mobile number",
  },
  TEACHER: {
    label: "Teacher",
    identifierLabel: "Facility / Employee ID",
    placeholder: "e.g. T-1001",
    type: "text",
    helperText: "Enter your employee or facility identifier",
  },
  ADMIN: {
    label: "Admin",
    identifierLabel: "Email Address",
    placeholder: "e.g. admin@school.edu",
    type: "email",
    helperText: "Enter your school administrator email",
  },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ error }: { error?: string }) {
  const [activeTab, setActiveTab] = useState<RoleTab>("STUDENT");
  const config = ROLE_CONFIG[activeTab];

  return (
    <div className="mt-6">
      {/* Role Selection Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1 text-xs font-medium text-gray-600">
        {(["STUDENT", "PARENT", "TEACHER", "ADMIN"] as RoleTab[]).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveTab(role)}
            className={`rounded-md py-1.5 text-center transition-all ${
              activeTab === role
                ? "bg-white font-semibold text-blue-600 shadow-xs"
                : "hover:text-gray-900"
            }`}
          >
            {ROLE_CONFIG[role].label}
          </button>
        ))}
      </div>

      <form action={loginAction} className="mt-5 space-y-4">
        <input type="hidden" name="role" value={activeTab} />

        {error !== undefined && ERROR_MESSAGES[error] !== undefined && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {ERROR_MESSAGES[error]}
          </p>
        )}

        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
            {config.identifierLabel}
          </label>
          <input
            id="identifier"
            name="identifier"
            type={config.type}
            required
            placeholder={config.placeholder}
            autoComplete="username"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{config.helperText}</p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}
