"use client";

import React, { useState, useEffect, useMemo } from "react";
import { isLocalDevHost } from "@/lib/auth/portal";
import { loginAction } from "@/app/auth-actions";
import {
  School,
  Shield,
  GraduationCap,
  Users,
  User,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  ChevronLeft,
  ExternalLink,
  Laptop,
  HeartHandshake,
} from "lucide-react";
import Link from "next/link";
import type { PortalType } from "@/lib/auth/portal";

type RoleKey = "admin" | "teacher" | "parent" | "student";

interface RoleConfig {
  key: RoleKey;
  label: string;
  badge: string;
  name: string;
  title: string;
  portal: "staff" | "family";
}

const roleConfigs: Record<RoleKey, RoleConfig> = {
  admin: {
    key: "admin",
    label: "Administrator",
    badge: "Principal's Office",
    name: "School Administrator",
    title: "Institutional Control & Operations",
    portal: "staff",
  },
  teacher: {
    key: "teacher",
    label: "Faculty / Teacher",
    badge: "Academic Staff",
    name: "Academic Faculty",
    title: "Class Teacher & Head of Department",
    portal: "staff",
  },
  parent: {
    key: "parent",
    label: "Parent / Guardian",
    badge: "Family Portal",
    name: "Guardian Portal",
    title: "Parental Supervision & Records",
    portal: "family",
  },
  student: {
    key: "student",
    label: "Student",
    badge: "Scholar Terminal",
    name: "Student Scholar",
    title: "Enrolled Scholar Terminal",
    portal: "family",
  },
};

/**
 * Identifier accepted per tab. The server action resolves non-email
 * identifiers (admission number, phone, employee ID) to the account email.
 */
const IDENTIFIER: Record<RoleKey, { role: string; label: string; placeholder: string; inputMode: "email" | "text" | "tel" }> = {
  admin: { role: "SCHOOL_ADMIN", label: "Email", placeholder: "admin@school.edu", inputMode: "email" },
  teacher: { role: "TEACHER", label: "Employee ID or email", placeholder: "T-1001 or name@school.edu", inputMode: "text" },
  parent: { role: "PARENT", label: "Mobile number or email", placeholder: "98765 43210 or parent@example.com", inputMode: "text" },
  student: { role: "STUDENT", label: "Admission number or email", placeholder: "GPS-2026-001 or name@school.edu", inputMode: "text" },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Those login details are incorrect. Check your ID/email and password.",
  disabled: "This account is disabled or not provisioned. Contact your school.",
  portal_mismatch_staff:
    "This account belongs to the Family Portal (Parents & Students). Access to the Staff Portal is restricted.",
  portal_mismatch_family:
    "This account belongs to the Staff Portal (Administration & Faculty). Access to the Family Portal is restricted.",
};

export function LoginForm({
  initialError,
  initialPortal = "unified",
  nextPath,
  staffBaseUrl = "https://staff.simplinschool.com",
  familyBaseUrl = "https://family.simplinschool.com",
  currentHost = "",
}: {
  initialError?: string;
  initialPortal?: PortalType;
  nextPath?: string;
  staffBaseUrl?: string;
  familyBaseUrl?: string;
  currentHost?: string;
}) {
  // In unified mode, user can toggle portal view
  const [activePortalTab, setActivePortalTab] = useState<"staff" | "family">(
    initialPortal === "family" ? "family" : "staff",
  );

  const effectivePortal: "staff" | "family" =
    initialPortal === "unified" ? activePortalTab : initialPortal;

  // Available roles filtered strictly by active portal
  const availableRoles = useMemo<readonly [RoleKey, ...RoleKey[]]>(
    () =>
      effectivePortal === "staff"
        ? ["admin", "teacher"]
        : ["parent", "student"],
    [effectivePortal],
  );

  const defaultRole: RoleKey = availableRoles[0];
  const [selectedRole, setSelectedRole] = useState<RoleKey>(defaultRole);
  const activeConfig = roleConfigs[selectedRole];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // When effective portal changes, sync selected role
  useEffect(() => {
    if (!availableRoles.includes(selectedRole)) {
      const nextRole: RoleKey = availableRoles[0];
      setSelectedRole(nextRole);
      setEmail("");
      setPassword("");
    }
  }, [effectivePortal, availableRoles, selectedRole]);

  useEffect(() => {
    setEmail("");
    setPassword("");
  }, [selectedRole]);

  const handleRoleChange = (key: RoleKey) => {
    setSelectedRole(key);
  };

  const getRoleIcon = (key: RoleKey) => {
    switch (key) {
      case "admin":
        return <Shield className="w-4 h-4" />;
      case "teacher":
        return <GraduationCap className="w-4 h-4" />;
      case "parent":
        return <Users className="w-4 h-4" />;
      case "student":
        return <User className="w-4 h-4" />;
    }
  };

  // Only known codes are shown; free text from the URL is never rendered.
  const errorMessage = initialError
    ? ERROR_MESSAGES[initialError] ?? "Sign-in failed. Please try again."
    : null;

  const isStaffPortal = effectivePortal === "staff";

  return (
    <div
      className="min-h-screen flex flex-col justify-between bg-background selection:bg-primary/20"
    >
      {/* Top Header */}
      <header
        className={`border-b transition-colors duration-200 ${
          isStaffPortal
            ? "border-border bg-surface-muted"
            : "border-border bg-surface"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Return to School Website</span>
          </Link>

          <div className="flex items-center gap-3">
            {initialPortal === "unified" && isLocalDevHost(currentHost) && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-gray-700 border border-border">
                <Laptop className="w-3 h-3" />
                <span>DEV MODE: UNIFIED</span>
              </span>
            )}
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span className="hidden md:inline">
                {isStaffPortal ? "STAFF AUTH PROTOCOL" : "FAMILY GUARDIAN GATEWAY"}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Login Card Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-lg">
          {/* Portal selector for single-domain hosts (and local development) */}
          {initialPortal === "unified" && (
            <div className="mb-6 p-2 bg-muted border border-border rounded-xl flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground px-2">
                Active Portal View:
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalTab("staff");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    activePortalTab === "staff"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-gray-700 hover:bg-border"
                  }`}
                  id="tab-portal-staff"
                >
                  Staff Portal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalTab("family");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    activePortalTab === "family"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-gray-700 hover:bg-border"
                  }`}
                  id="tab-portal-family"
                >
                  Family Portal
                </button>
              </div>
            </div>
          )}

          {/* School Badge & Portal Header */}
          <div className="text-center mb-8">
            <div
              className="w-13 h-13 rounded-2xl bg-sidebar text-white flex items-center justify-center mx-auto mb-3.5 shadow-md"
            >
              {isStaffPortal ? (
                <School className="w-7 h-7" />
              ) : (
                <HeartHandshake className="w-7 h-7" />
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isStaffPortal ? "STAFF ACCESS PORTAL" : "FAMILY & STUDENT PORTAL"}
            </h1>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mt-1.5">
              {isStaffPortal
                ? "SIMPLIN SCHOOL ERP • ADMINISTRATORS & TEACHERS"
                : "SIMPLIN SCHOOL ERP • PARENTS & STUDENTS"}
            </p>
          </div>

          <div
            className={`border rounded-2xl shadow-xs p-6 sm:p-8 transition-colors duration-200 ${
              isStaffPortal
                ? "bg-surface-muted border-border"
                : "bg-surface border-border"
            }`}
          >
            {/* Persona Selection Tabs (Strictly filtered by Portal) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                  {isStaffPortal
                    ? "Select Staff Credentials"
                    : "Select Family Persona"}
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {isStaffPortal ? "Authorized Personnel" : "Enrolled Families"}
                </span>
              </div>

              <div
                className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border bg-muted border-border"
              >
                {availableRoles.map((r) => {
                  const cfg = roleConfigs[r];
                  const active = selectedRole === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(r)}
                      className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-lg text-xs nav-item-interactive cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground font-bold shadow-xs border border-primary"
                          : "text-gray-700 hover:text-foreground hover:bg-muted"
                      }`}
                      id={`tab-role-${r}`}
                    >
                      <div className="mb-1">{getRoleIcon(r)}</div>
                      <span className="truncate w-full text-center leading-none font-medium">
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Persona Banner */}
            <div
              className={`mb-6 p-3.5 border rounded-xl flex items-center justify-between ${
                isStaffPortal
                  ? "bg-muted/70 border-border"
                  : "bg-muted border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg bg-sidebar text-white font-mono text-xs font-bold flex items-center justify-center"
                >
                  {activeConfig.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground leading-tight">
                    {activeConfig.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {activeConfig.title}
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message & Portal Mismatch Navigation */}
            {errorMessage && (
              <div role="alert" className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-900 text-xs rounded-xl flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                  <span className="font-medium leading-relaxed">
                    {errorMessage}
                  </span>
                </div>

                {initialError === "portal_mismatch_staff" && (
                  <div className="mt-1 pt-2 border-t border-red-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-red-800">
                      Looking for Parents & Students login?
                    </span>
                    <a
                      href={familyBaseUrl}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-900 underline hover:no-underline"
                    >
                      <span>Go to Family Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {initialError === "portal_mismatch_family" && (
                  <div className="mt-1 pt-2 border-t border-red-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-red-800">
                      Looking for Administration & Faculty login?
                    </span>
                    <a
                      href={staffBaseUrl}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-900 underline hover:no-underline"
                    >
                      <span>Go to Staff Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Real Authentication Form */}
            <form
              action={async (formData: FormData) => {
                setIsPending(true);
                try {
                  await loginAction(formData);
                } catch (e: unknown) {
                  if (
                    typeof e === "object" &&
                    e !== null &&
                    "digest" in e &&
                    typeof (e as { digest: unknown }).digest === "string" &&
                    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
                  ) {
                    throw e;
                  }
                  setIsPending(false);
                  throw e;
                }
              }}
              className="space-y-4"
            >
              {/* Hidden Inputs for Portal and Next redirect */}
              <input type="hidden" name="portal" value={effectivePortal} />
              <input type="hidden" name="role" value={IDENTIFIER[selectedRole].role} />
              {nextPath && <input type="hidden" name="next" value={nextPath} />}

              <div>
                <label htmlFor="input-email" className="block text-xs font-semibold text-foreground mb-1.5">
                  {IDENTIFIER[selectedRole].label}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    name="identifier"
                    type="text"
                    inputMode={IDENTIFIER[selectedRole].inputMode}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={IDENTIFIER[selectedRole].placeholder}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-surface border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all placeholder:text-gray-400"
                    id="input-email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Security Password
                  </label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Encrypted via Supabase
                  </span>
                </div>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-surface border border-input rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                    id="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-sm font-semibold text-primary-foreground flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                id="btn-submit-login"
              >
                {isPending ? (
                  <span>Verifying Credentials...</span>
                ) : (
                  <>
                    <span>
                      {isStaffPortal
                        ? "Enter Staff Portal"
                        : "Enter Family Portal"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Portal Switch Link at Bottom */}
            <div className="mt-6 pt-5 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
              <span>
                {isStaffPortal
                  ? "Are you a student or parent?"
                  : "Are you a teacher or administrator?"}
              </span>
              {initialPortal === "unified" ? (
                <button
                  type="button"
                  onClick={() =>
                    setActivePortalTab(isStaffPortal ? "family" : "staff")
                  }
                  className="font-semibold text-foreground hover:underline cursor-pointer"
                >
                  {isStaffPortal
                    ? "Switch to Family Portal →"
                    : "Switch to Staff Portal →"}
                </button>
              ) : (
                <a
                  href={isStaffPortal ? familyBaseUrl : staffBaseUrl}
                  className="font-semibold text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <span>
                    {isStaffPortal ? "Go to Family Portal" : "Go to Staff Portal"}
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className={`border-t py-4 text-center text-xs font-mono transition-colors duration-200 ${
          isStaffPortal
            ? "border-border bg-surface-muted text-muted-foreground"
            : "border-border bg-surface text-muted-foreground"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SIMPLIN SCHOOL ERP • SECURE ACCESS GATEWAY</span>
          <span>SYSTEM TIME: {new Date().getFullYear()} ACADEMIC SESSION</span>
        </div>
      </footer>
    </div>
  );
}
