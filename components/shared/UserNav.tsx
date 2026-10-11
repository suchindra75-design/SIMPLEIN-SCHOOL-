"use client";

import React, { useTransition } from "react";
import { logoutAction } from "@/app/auth-actions";
import { LogOut, Shield, GraduationCap, Users, User, Loader2 } from "lucide-react";

interface UserNavProps {
  name?: string;
  role?: string;
  schoolName?: string;
}

export function UserNav({
  name = "User",
  role = "SCHOOL_ADMIN",
  schoolName,
}: UserNavProps) {
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  const getRoleIcon = () => {
    const r = role.toUpperCase();
    if (r.includes("ADMIN")) return <Shield className="w-3.5 h-3.5 text-zinc-900" />;
    if (r.includes("TEACHER")) return <GraduationCap className="w-3.5 h-3.5 text-zinc-900" />;
    if (r.includes("PARENT")) return <Users className="w-3.5 h-3.5 text-zinc-900" />;
    if (r.includes("STUDENT")) return <User className="w-3.5 h-3.5 text-zinc-900" />;
    return <User className="w-3.5 h-3.5 text-zinc-900" />;
  };

  const getRoleLabel = () => {
    const r = role.toUpperCase();
    if (r.includes("ADMIN")) return "Administrator";
    if (r.includes("TEACHER")) return "Faculty";
    if (r.includes("PARENT")) return "Guardian";
    if (r.includes("STUDENT")) return "Scholar";
    return role;
  };

  const avatarText = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="flex items-center gap-2.5">
      {/* User profile indicator */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[#DCDCE0] bg-[#F8F8F9] shadow-2xs">
        <span className="w-6 h-6 rounded bg-[#191919] text-white flex items-center justify-center font-bold text-[10px] font-mono shrink-0">
          {avatarText}
        </span>
        <div className="text-left hidden sm:block leading-tight">
          <div className="flex items-center gap-1 text-xs font-semibold text-[#191919]">
            {getRoleIcon()}
            <span className="truncate max-w-[130px]" title={name}>
              {name}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
            {getRoleLabel()}
          </span>
        </div>
      </div>

      {/* Real Sign Out button calling server-side logoutAction */}
      <button
        onClick={handleSignOut}
        disabled={isPending}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#DCDCE0] bg-[#F8F8F9] hover:bg-[#E7E7E9] hover:border-[#191919] text-zinc-700 hover:text-[#191919] btn-interactive text-xs font-medium cursor-pointer disabled:opacity-50"
        title="Sign Out to Login Portal"
        id="user-sign-out-btn"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 text-zinc-600 animate-spin" />
        ) : (
          <LogOut className="w-3.5 h-3.5 text-zinc-600" />
        )}
        <span className="hidden md:inline">{isPending ? "Signing Out..." : "Sign Out"}</span>
      </button>
    </div>
  );
}
