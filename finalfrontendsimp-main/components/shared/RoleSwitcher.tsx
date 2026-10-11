"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { demoPersonas } from "@/lib/mock-data";
import { Role } from "@/lib/types";
import { ChevronDown, Shield, GraduationCap, Users } from "lucide-react";

export function RoleSwitcher() {
  const router = useRouter();
  const { role, currentPersona, setPersona } = useMockStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectRole = (pId: string, targetRole: Role) => {
    setPersona(pId);
    setOpen(false);
    if (targetRole === "admin") router.push("/admin/dashboard");
    else if (targetRole === "teacher") router.push("/teacher/dashboard");
    else if (targetRole === "parent") router.push("/parent/dashboard");
  };

  const getRoleIcon = (r: Role) => {
    switch (r) {
      case "admin":
        return <Shield className="w-3.5 h-3.5 text-zinc-900" />;
      case "teacher":
        return <GraduationCap className="w-3.5 h-3.5 text-zinc-900" />;
      case "parent":
        return <Users className="w-3.5 h-3.5 text-zinc-900" />;
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 text-zinc-900 transition-colors shadow-xs text-xs"
        title="Switch Demo Role Persona"
      >
        <span className="w-6 h-6 rounded bg-zinc-900 text-white flex items-center justify-center font-bold text-[10px] font-mono">
          {currentPersona.avatarText}
        </span>
        <div className="text-left hidden sm:block">
          <div className="flex items-center gap-1 font-semibold leading-none">
            {getRoleIcon(role)}
            <span>{currentPersona.name}</span>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mt-0.5 font-medium">
            {role}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-zinc-200 p-1.5 z-50">
          <div className="px-2 py-1.5 border-b border-zinc-100 mb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            Switch Demo Persona
          </div>
          {demoPersonas.map((p) => {
            const isSelected = p.id === currentPersona.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectRole(p.id, p.role)}
                className={`w-full text-left p-2 rounded-md flex items-start gap-2.5 transition-colors text-xs ${
                  isSelected
                    ? "bg-zinc-100 text-zinc-950 font-bold"
                    : "hover:bg-zinc-50 text-zinc-700"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold font-mono shrink-0 mt-0.5 ${
                    isSelected ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800"
                  }`}
                >
                  {p.avatarText}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate">{p.name}</span>
                    <span className="text-[9px] uppercase font-bold text-zinc-400 font-mono">
                      {p.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {p.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
