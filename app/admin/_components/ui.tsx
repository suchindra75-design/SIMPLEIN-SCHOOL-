import Link from "next/link";
import React from "react";
import { Plus, Search, RotateCcw } from "lucide-react";

/** Shared functional UI primitives for admin management pages with institutional design. */

export function PageHeader({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#DCDCE0] pb-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#191919] font-serif">
          {title}
        </h2>
      </div>
      {actionHref !== undefined && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#191919] hover:bg-[#2D2D30] text-white text-xs font-semibold btn-interactive shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{actionLabel ?? "New Record"}</span>
        </Link>
      )}
    </div>
  );
}

export function ErrorAlert({ error }: { error?: string }) {
  if (error === undefined) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50/80 p-3 text-xs text-red-800 font-mono">
      {error}
    </p>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DCDCE0] bg-[#F8F8F9] p-8 text-center text-xs text-[#6E6E73] font-mono">
      {message}
    </div>
  );
}

export function SearchBar({
  fields,
  values,
}: {
  fields: { name: string; label: string; type?: string; options?: { value: string; label: string }[] }[];
  values: Record<string, string | undefined>;
}) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 p-4 bg-[#F8F8F9] rounded-lg border border-[#DCDCE0] shadow-2xs card-interactive">
      {fields.map((f) =>
        f.options !== undefined ? (
          <label key={f.name} className="text-xs">
            <span className="mb-1 block font-semibold text-[#191919]">{f.label}</span>
            <select
              name={f.name}
              defaultValue={values[f.name] ?? ""}
              className="rounded-md border border-[#DCDCE0] bg-[#F1F1F2] px-3 py-1.5 text-xs text-[#191919] focus:outline-hidden focus:border-[#191919] focus:bg-[#F8F8F9] transition-colors duration-150"
            >
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={f.name} className="text-xs flex-1 min-w-[200px]">
            <span className="mb-1 block font-semibold text-[#191919]">{f.label}</span>
            <input
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={values[f.name] ?? ""}
              placeholder={`Filter by ${f.label.toLowerCase()}...`}
              className="w-full rounded-md border border-[#DCDCE0] bg-[#F1F1F2] px-3 py-1.5 text-xs text-[#191919] focus:outline-hidden focus:border-[#191919] focus:bg-[#F8F8F9] transition-colors duration-150"
            />
          </label>
        ),
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#191919] hover:bg-[#2D2D30] text-white text-xs font-semibold btn-interactive shadow-2xs cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Filter</span>
        </button>
        <Link
          href="?"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#DCDCE0] bg-[#F8F8F9] hover:bg-[#E7E7E9] text-[#191919] text-xs font-medium btn-interactive"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </Link>
      </div>
    </form>
  );
}

export function Pagination({
  page,
  limit,
  total,
  baseParams,
}: {
  page: number;
  limit: number;
  total: number;
  baseParams: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) {
      if (v !== undefined && v !== "") sp.set(k, v);
    }
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-[#6E6E73] font-mono">
      <span>
        Page <span className="font-bold text-[#191919]">{page}</span> of {pages} ({total} total records)
      </span>
      <div className="flex items-center gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="px-2.5 py-1 rounded-md border border-[#DCDCE0] bg-[#F8F8F9] hover:bg-[#E7E7E9] text-[#191919] font-medium btn-interactive"
          >
            Previous
          </Link>
        )}
        {page < pages && (
          <Link
            href={href(page + 1)}
            className="px-2.5 py-1 rounded-md border border-[#DCDCE0] bg-[#F8F8F9] hover:bg-[#E7E7E9] text-[#191919] font-medium btn-interactive"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider uppercase border ${
        active
          ? "bg-zinc-950 text-white border-zinc-950"
          : "bg-zinc-100 text-zinc-500 border-zinc-300"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-400"}`}
      />
      <span>{active ? "Active" : "Inactive"}</span>
    </span>
  );
}
