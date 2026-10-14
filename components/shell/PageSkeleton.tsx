/** Route-level loading placeholder shown while a portal page renders on the server. */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-fade-in space-y-6">
      <span className="sr-only">Loading page…</span>
      <div className="space-y-2">
        <div className="ui-skeleton h-7 w-56 max-w-full" />
        <div className="ui-skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ui-card space-y-3 p-5">
            <div className="ui-skeleton h-3 w-24" />
            <div className="ui-skeleton h-7 w-16" />
            <div className="ui-skeleton h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="ui-card overflow-hidden">
        <div className="border-b border-border bg-surface-muted px-5 py-3">
          <div className="ui-skeleton h-3 w-40" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
            <div className="ui-skeleton h-4 w-1/4" />
            <div className="ui-skeleton h-4 w-1/5" />
            <div className="ui-skeleton hidden h-4 w-1/6 sm:block" />
            <div className="ui-skeleton ml-auto h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default PageSkeleton;
