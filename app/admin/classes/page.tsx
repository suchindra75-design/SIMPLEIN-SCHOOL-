import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClassAction } from "@/app/admin/actions";
import { SmartForm } from "@/app/admin/_components/forms";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";
import { listClasses } from "@/lib/services/classes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Layers, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { classes } = await listClasses(db, ctx);
  const typed = classes;

  return (
    <div className="space-y-6">
      <PageHeader title="Classes & Cohorts" />

      {typed.length === 0 ? (
        <EmptyState message="No classes yet. Create Class 1 … Class 10, or Nursery/LKG/UKG below." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {typed.map((c) => (
            <Link
              key={c.id}
              href={`/admin/classes/${c.id}`}
              className="bg-white rounded-lg border border-zinc-200 p-4 shadow-2xs hover:border-zinc-900 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-zinc-900" />
                    <span className="font-bold text-sm text-zinc-950 font-serif">
                      {c.name}
                    </span>
                  </div>
                  <StatusBadge active={c.isActive} />
                </div>
                <div className="text-xs text-zinc-500 font-mono mt-1">
                  Sections:{" "}
                  <span className="text-zinc-800 font-semibold">
                    {(c.sections ?? []).map((s) => s.name).join(", ") || "No sections"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] font-mono text-zinc-600">
                <span>Manage Cohort</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Class Form */}
      <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs max-w-xl">
        <h3 className="text-sm font-bold text-zinc-950 font-mono mb-4 uppercase tracking-wider">
          Add New Academic Class
        </h3>
        <SmartForm
          action={createClassAction}
          submitLabel="Create Class"
          fields={[
            { name: "name", label: "Class Name", required: true, placeholder: "e.g. Grade 7" },
            { name: "orderIndex", label: "Display Order Index", type: "number", defaultValue: "0" },
          ]}
        />
      </div>
    </div>
  );
}
