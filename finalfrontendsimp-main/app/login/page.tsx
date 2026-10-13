"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { Role } from "@/lib/types";
import {
  School,
  Shield,
  GraduationCap,
  Users,
  User,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Sparkles,
  ChevronLeft,
} from "lucide-react";

interface RoleConfig {
  role: Role;
  personaId: string;
  label: string;
  badge: string;
  email: string;
  rollId?: string;
  name: string;
  title: string;
  targetDashboard: string;
}

const roleConfigs: Record<Role, RoleConfig> = {
  admin: {
    role: "admin",
    personaId: "persona-admin",
    label: "Administrator",
    badge: "Principal's Office",
    email: "principal.vance@simplein.edu",
    name: "Dr. Robert Vance",
    title: "Head of School & Principal",
    targetDashboard: "/admin/dashboard",
  },
  teacher: {
    role: "teacher",
    personaId: "persona-teacher",
    label: "Faculty / Teacher",
    badge: "Academic Staff",
    email: "s.jenkins@simplein.edu",
    name: "Sarah Jenkins",
    title: "Class Teacher (5-A) & Head of Science",
    targetDashboard: "/teacher/dashboard",
  },
  parent: {
    role: "parent",
    personaId: "persona-parent",
    label: "Parent / Guardian",
    badge: "Family Portal",
    email: "d.miller@parent.simplein.edu",
    name: "David Miller",
    title: "Guardian of Lucas & Sophia Miller",
    targetDashboard: "/parent/dashboard",
  },
  student: {
    role: "student",
    personaId: "persona-student",
    label: "Student",
    badge: "Scholar Terminal",
    email: "lucas.m@student.simplein.edu",
    rollId: "5A-01",
    name: "Lucas Miller",
    title: "Grade 5-A Scholar (Roll: 5A-01)",
    targetDashboard: "/student/dashboard",
  },
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, school } = useMockStore();

  const initialRoleParam = searchParams.get("role") as Role | null;
  const [selectedRole, setSelectedRole] = useState<Role>(
    initialRoleParam && roleConfigs[initialRoleParam] ? initialRoleParam : "admin"
  );

  const activeConfig = roleConfigs[selectedRole];

  const [identifier, setIdentifier] = useState(activeConfig.email);
  const [password, setPassword] = useState("••••••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // When changing role, update pre-filled identifier
  useEffect(() => {
    setIdentifier(activeConfig.email);
    setPassword("••••••••••••");
    setError(null);
  }, [selectedRole]);

  const handleRoleChange = (newRole: Role) => {
    setSelectedRole(newRole);
  };

  const handleQuickFill = () => {
    setIdentifier(activeConfig.email);
    setPassword("Simplein2026!");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Please enter your institutional email or scholar ID.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your terminal security password.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(activeConfig.role, activeConfig.personaId);
      router.push(activeConfig.targetDashboard);
    } catch (err: any) {
      setError("Authentication failed. Please verify credentials.");
      setIsLoading(false);
    }
  };

  const getRoleIcon = (r: Role) => {
    switch (r) {
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

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-between selection:bg-zinc-900 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono text-zinc-600 hover:text-zinc-950 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Return to School Website</span>
          </Link>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            <span>TERMINAL ENCRYPTION: ACTIVE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
        </div>
      </header>

      {/* Main Login Card Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-lg">
          {/* School Badge & Card Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-950 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
              <School className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
              {school.name}
            </h1>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider mt-1">
              Authorized Institutional Access Portal
            </p>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-6 sm:p-8">
            {/* Role Selection Tabs */}
            <div className="mb-6">
              <label className="block text-xs font-mono font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                Select Persona / Access Level
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-zinc-100 rounded-lg border border-zinc-200">
                {(["admin", "teacher", "parent", "student"] as Role[]).map((r) => {
                  const cfg = roleConfigs[r];
                  const active = selectedRole === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(r)}
                      className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-md text-xs transition-all ${
                        active
                          ? "bg-white text-zinc-950 font-bold shadow-xs border border-zinc-200"
                          : "text-zinc-600 hover:text-zinc-950 hover:bg-white/60"
                      }`}
                      id={`tab-role-${r}`}
                    >
                      <div className="mb-1">{getRoleIcon(r)}</div>
                      <span className="truncate w-full text-center leading-none">
                        {cfg.label.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Persona Banner */}
            <div className="mb-6 p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-zinc-950 text-white font-mono text-xs font-bold flex items-center justify-center">
                  {activeConfig.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 leading-tight">
                    {activeConfig.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    {activeConfig.title}
                  </div>
                </div>
              </div>

              {/* Quick Fill Button */}
              <button
                type="button"
                onClick={handleQuickFill}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-300 bg-white text-[11px] font-mono font-semibold text-zinc-700 hover:border-zinc-900 hover:text-zinc-950 transition-colors shadow-2xs"
                title="Quick Fill Demo Credentials"
              >
                <Sparkles className="w-3 h-3 text-zinc-900" />
                <span>Demo Fill</span>
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-900 text-xs rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                  {selectedRole === "student"
                    ? "Institutional Email or Roll ID"
                    : "Institutional Email"}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={activeConfig.email}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-md focus:outline-hidden focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 font-mono text-zinc-900"
                    id="login-identifier-input"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-800">
                    Terminal Security Key
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotModalOpen(true);
                      setForgotSubmitted(false);
                    }}
                    className="text-[11px] font-mono text-zinc-500 hover:text-zinc-900 hover:underline"
                  >
                    Forgot passcode?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security key"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-zinc-300 rounded-md focus:outline-hidden focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 font-mono text-zinc-900"
                    id="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-700"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 accent-zinc-950"
                  />
                  <span className="text-xs text-zinc-600">Trust this station for 30 days</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-md bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                id="login-submit-button"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Enter {activeConfig.label} Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Institutional Advisory Note */}
          <div className="text-center mt-6 text-xs text-zinc-500 font-mono leading-relaxed">
            SIMPLEIN SECURE GATEWAY • STRICT ROLE PERMISSIONS ENFORCED
            <br />
            For credential resets or enrollment assistance, contact the Registrar’s Desk.
          </div>
        </div>
      </main>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-zinc-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="font-serif text-lg font-bold text-zinc-950 mb-2">
              Credential Recovery Service
            </h3>
            <p className="text-xs text-zinc-600 mb-4 leading-relaxed">
              Institutional credentials are managed centrally by the Registrar. Enter your registered email address to receive an immediate self-service bypass token.
            </p>

            {forgotSubmitted ? (
              <div className="p-3 bg-zinc-100 border border-zinc-300 rounded-md text-xs font-mono text-zinc-900 mb-4 flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Recovery token dispatched to <strong>{identifier}</strong>. In demo mode, use the &apos;Demo Fill&apos; button to proceed immediately.
                </span>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Registered Identifier
                  </label>
                  <input
                    type="text"
                    defaultValue={identifier}
                    className="w-full px-3 py-2 text-xs border border-zinc-300 rounded font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="px-3 py-1.5 rounded border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
              >
                Close
              </button>
              {!forgotSubmitted && (
                <button
                  type="button"
                  onClick={() => setForgotSubmitted(true)}
                  className="px-3 py-1.5 rounded bg-zinc-950 text-white text-xs font-semibold hover:bg-zinc-800"
                >
                  Send Recovery Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Minimal Footer */}
      <footer className="border-t border-zinc-200 bg-white py-4 text-center text-xs font-mono text-zinc-400">
        © 2026 {school.name}. Single sign-on authentication service.
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-xs font-mono text-zinc-500">
          Loading authentication gateway...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
