import Link from "next/link";
import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Inbox,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

/** Shared UI primitives used across every portal (admin, teacher, parent, student). */

export function PageHeader({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
  /** Extra contextual actions rendered beside the primary action. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description !== undefined ? <p className="page-description">{description}</p> : null}
      </div>
      {actionHref !== undefined || children !== undefined ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
          {actionHref !== undefined ? (
            <Link href={actionHref} className="ui-btn ui-btn-primary">
              <Plus aria-hidden="true" className="size-4" />
              <span>{actionLabel ?? "New record"}</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Titled card used for dashboard sections, with an optional "view all" link. */
export function SectionCard({
  title,
  icon: Icon,
  href,
  linkLabel = "View all",
  children,
  className = "",
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-card flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 section-title">
          {Icon !== undefined ? (
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          ) : null}
          {title}
        </h2>
        {href !== undefined ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {linkLabel}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}

export function ErrorAlert({ error }: { error?: string }) {
  if (error === undefined) return null;
  return (
    <div role="alert" className="ui-alert ui-alert-error mb-4 animate-fade-in">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{error}</p>
    </div>
  );
}

export function EmptyState({ message, title }: { message: string; title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Inbox aria-hidden="true" className="size-5" />
      </span>
      {title !== undefined ? (
        <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      ) : null}
      <p className={`max-w-md text-sm text-muted-foreground ${title !== undefined ? "mt-1" : "mt-3"}`}>
        {message}
      </p>
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
    <form
      method="get"
      role="search"
      className="ui-card mb-5 flex flex-wrap items-end gap-3 p-4"
    >
      {fields.map((f) =>
        f.options !== undefined ? (
          <label key={f.name} className="min-w-[10rem]">
            <span className="ui-label">{f.label}</span>
            <select name={f.name} defaultValue={values[f.name] ?? ""} className="ui-input">
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={f.name} className="min-w-[200px] flex-1">
            <span className="ui-label">{f.label}</span>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={values[f.name] ?? ""}
                placeholder={`Search by ${f.label.toLowerCase()}…`}
                className="ui-input pl-8"
              />
            </span>
          </label>
        ),
      )}
      <div className="flex items-center gap-2">
        <button type="submit" className="ui-btn ui-btn-primary">
          <Search aria-hidden="true" className="size-4" />
          <span>Apply</span>
        </button>
        <Link href="?" className="ui-btn ui-btn-ghost">
          <RotateCcw aria-hidden="true" className="size-4" />
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
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <span>
        Page <span className="font-medium text-foreground">{page}</span> of {pages}
        <span className="text-gray-400"> · </span>
        {total} records
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="ui-btn ui-btn-secondary ui-btn-sm">
            <ChevronLeft aria-hidden="true" className="size-4" />
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className="ui-btn ui-btn-secondary ui-btn-sm">
            <ChevronLeft aria-hidden="true" className="size-4" />
            Previous
          </span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className="ui-btn ui-btn-secondary ui-btn-sm">
            Next
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <span aria-disabled="true" className="ui-btn ui-btn-secondary ui-btn-sm">
            Next
            <ChevronRight aria-hidden="true" className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`ui-badge ${active ? "ui-badge-success" : "ui-badge-neutral"}`}>
      <span aria-hidden="true" className="ui-badge-dot" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
