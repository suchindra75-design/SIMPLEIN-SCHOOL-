import Link from "next/link";

/** Shared functional UI primitives for admin management pages. */

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
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-semibold">{title}</h2>
      {actionHref !== undefined && (
        <Link
          href={actionHref}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
        >
          {actionLabel ?? "New"}
        </Link>
      )}
    </div>
  );
}

export function ErrorAlert({ error }: { error?: string }) {
  if (error === undefined) return null;
  return (
    <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
      {error}
    </p>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
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
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
      {fields.map((f) =>
        f.options !== undefined ? (
          <label key={f.name} className="text-sm">
            <span className="mb-1 block text-gray-600">{f.label}</span>
            <select
              name={f.name}
              defaultValue={values[f.name] ?? ""}
              className="rounded border px-2 py-1.5"
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
          <label key={f.name} className="text-sm">
            <span className="mb-1 block text-gray-600">{f.label}</span>
            <input
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={values[f.name] ?? ""}
              className="rounded border px-2 py-1.5"
            />
          </label>
        ),
      )}
      <button type="submit" className="rounded border px-3 py-1.5 text-sm">
        Search
      </button>
      <Link href="?" className="rounded border px-3 py-1.5 text-sm text-gray-600">
        Clear
      </Link>
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
    <div className="mt-4 flex items-center gap-3 text-sm">
      <span className="text-gray-600">
        Page {page} of {pages} ({total} total)
      </span>
      {page > 1 && (
        <Link href={href(page - 1)} className="rounded border px-2 py-1">
          Previous
        </Link>
      )}
      {page < pages && (
        <Link href={href(page + 1)} className="rounded border px-2 py-1">
          Next
        </Link>
      )}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
