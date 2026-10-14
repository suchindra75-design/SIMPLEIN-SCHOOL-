"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { labelForPath, type PortalConfig } from "./nav-config";

const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  import: "Import",
  edit: "Edit",
  results: "Results",
  dashboard: "Dashboard",
};

function segmentLabel(segment: string): string {
  if (SEGMENT_LABELS[segment] !== undefined) return SEGMENT_LABELS[segment];
  // Record identifiers (UUIDs and similar) read better as "Details".
  if (/^[0-9a-f-]{8,}$/i.test(segment)) return "Details";
  const words = segment.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface Crumb {
  href: string;
  label: string;
}

function buildCrumbs(config: PortalConfig, pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ href: config.home, label: "Dashboard" }];
  if (pathname === config.home) return crumbs;

  // Shared routes (e.g. /notifications) sit outside the portal prefix.
  const base = pathname.startsWith(`${config.home}/`) ? config.home : "";
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  let href = base;
  for (const segment of rest) {
    href = `${href}/${segment}`;
    crumbs.push({ href, label: labelForPath(config, href) ?? segmentLabel(segment) });
  }
  return crumbs;
}

export function Breadcrumbs({ config, pathname }: { config: PortalConfig; pathname: string }) {
  const crumbs = buildCrumbs(config, pathname);
  const last = crumbs.length - 1;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <li
            key={crumb.href}
            className={`min-w-0 items-center gap-1 ${i === last ? "flex" : "hidden sm:flex"}`}
          >
            {i > 0 ? (
              <ChevronRight
                aria-hidden="true"
                className="hidden size-3.5 shrink-0 text-gray-400 sm:block"
              />
            ) : null}
            {i === last ? (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate rounded text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
