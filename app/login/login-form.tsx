"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Sparkles,
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
  email: string;
  passwordDefault: string;
  name: string;
  title: string;
  portal: "staff" | "family";
}

const roleConfigs: Record<RoleKey, RoleConfig> = {
  admin: {
    key: "admin",
    label: "Administrator",
    badge: "Principal's Office",
    email: "admin.staging@simpleinschool.test",
    passwordDefault: "8YNrMOAEySlsZwPnrx7C7AK4",
    name: "School Administrator",
    title: "Institutional Control & Operations",
    portal: "staff",
  },
  teacher: {
    key: "teacher",
    label: "Faculty / Teacher",
    badge: "Academic Staff",
    email: "teacher.staging@simpleinschool.test",
    passwordDefault: "MHxRFzbIA8YGcz8Mn7JxPxjo",
    name: "Academic Faculty",
    title: "Class Teacher & Head of Department",
    portal: "staff",
  },
  parent: {
    key: "parent",
    label: "Parent / Guardian",
    badge: "Family Portal",
    email: "parent.staging@simpleinschool.test",
    passwordDefault: "xbzFTaBZ0uMj5y73gL1zb4hQ",
    name: "Guardian Portal",
    title: "Parental Supervision & Records",
    portal: "family",
  },
  student: {
    key: "student",
    label: "Student",
    badge: "Scholar Terminal",
    email: "student.staging@simpleinschool.test",
    passwordDefault: "cPEQbPYIHwTerHdrrkV4eg4e",
    name: "Student Scholar",
    title: "Enrolled Scholar Terminal",
    portal: "family",
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Invalid email or password.",
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

  const [email, setEmail] = useState(activeConfig.email);
  const [password, setPassword] = useState(activeConfig.passwordDefault);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // When effective portal changes, sync selected role
  useEffect(() => {
    if (!availableRoles.includes(selectedRole)) {
      const nextRole: RoleKey = availableRoles[0];
      setSelectedRole(nextRole);
      setEmail(roleConfigs[nextRole].email);
      setPassword(roleConfigs[nextRole].passwordDefault);
    }
  }, [effectivePortal, availableRoles, selectedRole]);

  useEffect(() => {
    setEmail(activeConfig.email);
    setPassword(activeConfig.passwordDefault);
  }, [selectedRole, activeConfig]);

  const handleRoleChange = (key: RoleKey) => {
    setSelectedRole(key);
  };

  const handleQuickFill = () => {
    setEmail(activeConfig.email);
    setPassword(activeConfig.passwordDefault);
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

  const errorMessage = initialError
    ? ERROR_MESSAGES[initialError] ?? initialError
    : null;

  const isStaffPortal = effectivePortal === "staff";

  return (
    <div
      className={`min-h-screen flex flex-col justify-between selection:text-white transition-colors duration-200 ${
        isStaffPortal
          ? "bg-[#F1F1F2] selection:bg-[#191919]"
          : "bg-[#F4F4F6] selection:bg-[#1E2238]"
      }`}
    >
      {/* Top Header */}
      <header
        className={`border-b transition-colors duration-200 ${
          isStaffPortal
            ? "border-[#DCDCE0] bg-[#F8F8F9]"
            : "border-[#D8D8DE] bg-[#FFFFFF]"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono text-[#6E6E73] hover:text-[#191919] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Return to School Website</span>
          </Link>

          <div className="flex items-center gap-3">
            {initialPortal === "unified" && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-[#E7E7E9] text-[#48484A] border border-[#DCDCE0]">
                <Laptop className="w-3 h-3" />
                <span>DEV MODE: UNIFIED</span>
              </span>
            )}
            <div className="flex items-center gap-2 text-xs font-mono text-[#6E6E73]">
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
          {/* Unified Dev Mode Portal Selector */}
          {initialPortal === "unified" && (
            <div className="mb-6 p-2 bg-[#E7E7E9] border border-[#DCDCE0] rounded-xl flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#6E6E73] px-2">
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
                      ? "bg-[#191919] text-white shadow-xs"
                      : "text-[#48484A] hover:bg-[#DCDCE0]"
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
                      ? "bg-[#1E2238] text-white shadow-xs"
                      : "text-[#48484A] hover:bg-[#DCDCE0]"
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
              className={`w-13 h-13 rounded-2xl text-white flex items-center justify-center mx-auto mb-3.5 shadow-md transition-colors duration-200 ${
                isStaffPortal ? "bg-[#191919]" : "bg-[#1E2238]"
              }`}
            >
              {isStaffPortal ? (
                <School className="w-7 h-7" />
              ) : (
                <HeartHandshake className="w-7 h-7" />
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#191919]">
              {isStaffPortal ? "STAFF ACCESS PORTAL" : "FAMILY & STUDENT PORTAL"}
            </h1>
            <p className="text-xs font-mono text-[#6E6E73] uppercase tracking-wider mt-1.5">
              {isStaffPortal
                ? "SIMPLIN SCHOOL ERP • ADMINISTRATIVE & ACADEMIC GATEWAY"
                : "SIMPLIN SCHOOL • PARENTAL SUPERVISION & SCHOLAR TERMINAL"}
            </p>
          </div>

          <div
            className={`border rounded-2xl shadow-xs p-6 sm:p-8 transition-colors duration-200 ${
              isStaffPortal
                ? "bg-[#F8F8F9] border-[#DCDCE0]"
                : "bg-[#FFFFFF] border-[#D8D8DE]"
            }`}
          >
            {/* Persona Selection Tabs (Strictly filtered by Portal) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-[#6E6E73]">
                  {isStaffPortal
                    ? "Select Staff Credentials"
                    : "Select Family Persona"}
                </label>
                <span className="text-[11px] font-mono text-[#6E6E73]">
                  {isStaffPortal ? "Authorized Personnel" : "Enrolled Families"}
                </span>
              </div>

              <div
                className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${
                  isStaffPortal
                    ? "bg-[#E7E7E9] border-[#DCDCE0]"
                    : "bg-[#EAEAF0] border-[#D8D8DE]"
                }`}
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
                          ? isStaffPortal
                            ? "bg-[#191919] text-white font-bold shadow-xs border border-[#191919]"
                            : "bg-[#1E2238] text-white font-bold shadow-xs border border-[#1E2238]"
                          : "text-[#48484A] hover:text-[#191919] hover:bg-[#DCDCE0]/70"
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
                  ? "bg-[#E7E7E9]/70 border-[#DCDCE0]"
                  : "bg-[#F2F2F6] border-[#DCDCE0]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg text-white font-mono text-xs font-bold flex items-center justify-center ${
                    isStaffPortal ? "bg-[#191919]" : "bg-[#1E2238]"
                  }`}
                >
                  {activeConfig.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#191919] leading-tight">
                    {activeConfig.name}
                  </div>
                  <div className="text-[11px] text-[#6E6E73] font-mono mt-0.5">
                    {activeConfig.title}
                  </div>
                </div>
              </div>

              {/* Quick Fill Button */}
              <button
                type="button"
                onClick={handleQuickFill}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#DCDCE0] bg-[#FFFFFF] text-[11px] font-mono font-semibold text-[#191919] hover:border-[#191919] hover:bg-[#E7E7E9] btn-interactive shadow-2xs cursor-pointer"
                title="Quick Fill Staging Credentials"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#191919]" />
                <span>Quick Fill</span>
              </button>
            </div>

            {/* Error Message & Portal Mismatch Navigation */}
            {errorMessage && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-900 text-xs rounded-xl flex flex-col gap-2">
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
                } catch (e) {
                  setIsPending(false);
                  throw e;
                }
              }}
              className="space-y-4"
            >
              {/* Hidden Inputs for Portal and Next redirect */}
              <input type="hidden" name="portal" value={effectivePortal} />
              {nextPath && <input type="hidden" name="next" value={nextPath} />}

              <div>
                <label className="block text-xs font-semibold text-[#191919] mb-1.5">
                  {isStaffPortal ? "Institutional Email" : "Registered Family Email"}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6E6E73]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      isStaffPortal
                        ? "staff.name@simplinschool.com"
                        : "parent@example.com"
                    }
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#FFFFFF] border border-[#DCDCE0] rounded-xl text-sm text-[#191919] focus:outline-none focus:ring-2 focus:ring-[#191919] focus:border-transparent transition-all placeholder:text-[#A0A0A5]"
                    id="input-email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#191919]">
                    Security Password
                  </label>
                  <span className="text-[11px] text-[#6E6E73] font-mono">
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
                    className="w-full pl-3.5 pr-10 py-2.5 bg-[#FFFFFF] border border-[#DCDCE0] rounded-xl text-sm font-mono text-[#191919] focus:outline-none focus:ring-2 focus:ring-[#191919] focus:border-transparent transition-all"
                    id="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#6E6E73] hover:text-[#191919]"
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
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  isStaffPortal
                    ? "bg-[#191919] hover:bg-[#333333]"
                    : "bg-[#1E2238] hover:bg-[#2C334E]"
                }`}
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
            <div className="mt-6 pt-5 border-t border-[#DCDCE0] flex flex-col sm:flex-row items-center justify-between text-xs text-[#6E6E73] gap-2">
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
                  className="font-semibold text-[#191919] hover:underline cursor-pointer"
                >
                  {isStaffPortal
                    ? "Switch to Family Portal →"
                    : "Switch to Staff Portal →"}
                </button>
              ) : (
                <a
                  href={isStaffPortal ? familyBaseUrl : staffBaseUrl}
                  className="font-semibold text-[#191919] hover:underline inline-flex items-center gap-1"
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
            ? "border-[#DCDCE0] bg-[#F8F8F9] text-[#6E6E73]"
            : "border-[#D8D8DE] bg-[#FFFFFF] text-[#6E6E73]"
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
