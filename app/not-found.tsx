import React from "react";
import Link from "next/link";
import { FileQuestion, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-50 min-h-[70vh] selection:bg-zinc-900 selection:text-white">
      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-zinc-900 mb-4 border border-zinc-200 shadow-2xs">
        <FileQuestion className="w-6 h-6 stroke-[1.5]" />
      </div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
        Registry Error 404
      </span>
      <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">
        Record or Page Not Found
      </h1>
      <p className="mt-2 text-xs text-zinc-600 max-w-sm leading-relaxed font-mono">
        The requested academic record, student transcript, or portal view does not exist in the active school directory.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-md transition-colors shadow-2xs"
        >
          <Home className="w-3.5 h-3.5" />
          <span>School Website</span>
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded-md transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Login Gateway</span>
        </Link>
      </div>
    </div>
  );
}
