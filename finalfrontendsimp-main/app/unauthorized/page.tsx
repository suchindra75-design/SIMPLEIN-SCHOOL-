"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, LogIn } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-50 min-h-[70vh] selection:bg-zinc-900 selection:text-white">
      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-zinc-900 mb-4 border border-zinc-200 shadow-2xs">
        <ShieldAlert className="w-6 h-6 stroke-[1.5]" />
      </div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
        Security Gateway 403
      </span>
      <h1 className="font-serif text-2xl font-bold text-zinc-950 tracking-tight">
        Access Clearance Required
      </h1>
      <p className="mt-2 text-xs text-zinc-600 max-w-sm leading-relaxed">
        Your current session does not possess the requisite clearance level for this departmental module. Please authenticate with an authorized account.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded-md transition-colors shadow-2xs"
        >
          <LogIn className="w-3.5 h-3.5" />
          Switch or Sign In Account
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-md transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Return to School Home
        </Link>
      </div>
    </div>
  );
}
