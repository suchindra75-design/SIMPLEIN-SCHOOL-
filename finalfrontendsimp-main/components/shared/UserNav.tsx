"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { LogOut, Shield, GraduationCap, Users, User } from "lucide-react";

export function UserNav() {
  const router = useRouter();
  const { role, currentPersona, logout } = useMockStore();

  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  const getRoleIcon = () => {
    switch (role) {
      case "admin":
        return <Shield className="w-3.5 h-3.5 text-zinc-900" />;
      case "teacher":
        return <GraduationCap className="w-3.5 h-3.5 text-zinc-900" />;
      case "parent":
        return <Users className="w-3.5 h-3.5 text-zinc-900" />;
      case "student":
        return <User className="w-3.5 h-3.5 text-zinc-900" />;
      default:
        return null;
    }
  };

  const getRoleLabel = () => {
    switch (role) {
      case "admin":
        return "Administrator";
      case "teacher":
        return "Faculty";
      case "parent":
        return "Guardian";
      case "student":
        return "Scholar";
      default:
        return "User";
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      {/* User profile indicator - Clean and static without confusing dropdown */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white">
        <span className="w-6 h-6 rounded bg-zinc-900 text-white flex items-center justify-center font-bold text-[10px] font-mono shrink-0">
          {currentPersona?.avatarText || "U"}
        </span>
        <div className="text-left hidden sm:block leading-tight">
          <div className="flex items-center gap-1 text-xs font-semibold text-zinc-900">
            {getRoleIcon()}
            <span className="truncate max-w-[130px]">{currentPersona?.name}</span>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
            {getRoleLabel()}
          </span>
        </div>
      </div>

      {/* Explicit Sign Out button linking back to login */}
      <button
        onClick={handleSignOut}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-100 hover:border-zinc-900 text-zinc-700 hover:text-zinc-900 transition-colors text-xs font-medium cursor-pointer"
        title="Sign Out to Login Portal"
        id="user-sign-out-btn"
      >
        <LogOut className="w-3.5 h-3.5 text-zinc-600" />
        <span className="hidden md:inline">Sign Out</span>
      </button>
    </div>
  );
}
