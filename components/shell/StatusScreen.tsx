import React from "react";

/** Full-page status message (404, 403, errors) shown outside the portal shell. */
export function StatusScreen({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="ui-card w-full max-w-md animate-page-enter p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1 page-title">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children !== undefined ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>
        ) : null}
      </div>
    </main>
  );
}
