"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, School, X } from "lucide-react";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { Breadcrumbs } from "./Breadcrumbs";
import { UserMenu } from "./UserMenu";
import { PORTALS, isActivePath, type PortalConfig, type ShellRole } from "./nav-config";

const COLLAPSE_KEY = "simplin.sidebar.collapsed";

interface AppShellProps {
  role: ShellRole;
  schoolName: string;
  userName: string;
  contextLine?: string | null;
  children: React.ReactNode;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Portal navigation. `rail` collapses to icons: always on tablet widths, and on
 * desktop when the user collapses the sidebar. The drawer always shows labels.
 */
function SidebarNav({
  config,
  pathname,
  variant,
  collapsed,
  onNavigate,
}: {
  config: PortalConfig;
  pathname: string;
  variant: "sidebar" | "drawer";
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const drawer = variant === "drawer";
  const labelClass = drawer ? "truncate" : collapsed ? "sr-only" : "sr-only lg:not-sr-only lg:truncate";
  const headingClass = drawer ? "block" : collapsed ? "hidden" : "hidden lg:block";
  const dividerClass = drawer ? "hidden" : collapsed ? "block" : "block lg:hidden";
  const itemLayout = drawer
    ? "justify-start px-3"
    : collapsed
      ? "justify-center px-0"
      : "justify-center px-0 lg:justify-start lg:px-3";

  return (
    <nav aria-label={`${config.portalLabel} navigation`} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
      {config.groups.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? "mt-4" : undefined}>
          {gi > 0 ? (
            <div aria-hidden="true" className={cx("mx-2 mb-3 h-px bg-sidebar-border", dividerClass)} />
          ) : null}
          <p
            className={cx(
              "mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted/80",
              headingClass,
            )}
          >
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href, config.home);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={!drawer && collapsed ? item.label : undefined}
                    className={cx(
                      "group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium outline-none transition-colors duration-150",
                      "focus-visible:ring-2 focus-visible:ring-white/70",
                      itemLayout,
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        "absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-sidebar-foreground transition-opacity duration-200",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                    <span className={labelClass}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({
  config,
  schoolName,
  compact,
}: {
  config: PortalConfig;
  schoolName: string;
  compact: "always" | "responsive" | "never";
}) {
  const textClass = compact === "always" ? "sr-only" : compact === "responsive" ? "sr-only lg:not-sr-only" : "";
  return (
    <Link
      href={config.home}
      className={cx(
        "flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        compact === "always" ? "justify-center" : compact === "responsive" ? "justify-center lg:justify-start" : "",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-foreground text-sidebar">
        <School aria-hidden="true" className="size-4" />
      </span>
      <span className={cx("min-w-0 leading-tight", textClass)}>
        <span className="block truncate text-sm font-semibold text-sidebar-foreground">{schoolName}</span>
        <span className="block truncate text-xs text-sidebar-muted">{config.portalLabel}</span>
      </span>
    </Link>
  );
}

export function AppShell({ role, schoolName, userName, contextLine, children }: AppShellProps) {
  const config = PORTALS[role];
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  // Restore the saved sidebar width, then enable width transitions so the
  // initial restore does not animate.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage unavailable (private mode, blocked): keep the default.
    }
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Non-critical preference.
      }
      return next;
    });
  };

  // Navigating closes the drawer without stealing focus back to the trigger.
  useEffect(() => {
    restoreFocusRef.current = false;
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const panel = drawerRef.current;
    const trigger = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        restoreFocusRef.current = true;
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (restoreFocusRef.current) trigger?.focus();
    };
  }, [drawerOpen]);

  const closeDrawer = (restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setDrawerOpen(false);
  };

  return (
    <div data-portal={config.portal} className="flex min-h-dvh bg-background">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Desktop & tablet sidebar */}
      <aside
        className={cx(
          "app-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
          animate && "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "w-[4.5rem]" : "w-[4.5rem] lg:w-64",
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <Brand config={config} schoolName={schoolName} compact={collapsed ? "always" : "responsive"} />
        </div>

        <SidebarNav config={config} pathname={pathname} variant="sidebar" collapsed={collapsed} />

        <div className="hidden shrink-0 border-t border-sidebar-border p-3 lg:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cx(
              "flex h-9 w-full items-center gap-3 rounded-lg text-sm text-sidebar-muted outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-white/70",
              collapsed ? "justify-center" : "px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-[18px] shrink-0" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-[18px] shrink-0" />
            )}
            <span className={collapsed ? "sr-only" : "truncate"}>Collapse sidebar</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer. Visibility flips immediately on open (so focus can move
          into the panel) and is delayed on close (so the slide-out stays visible). */}
      <div
        className={cx(
          "fixed inset-0 z-50 md:hidden",
          drawerOpen ? "visible" : "pointer-events-none invisible transition-[visibility] duration-300",
        )}
        inert={!drawerOpen}
      >
        <div
          aria-hidden="true"
          onClick={() => closeDrawer(true)}
          className={cx(
            "absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ease-out",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={drawerRef}
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label={`${config.portalLabel} menu`}
          className={cx(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-sidebar-border px-4">
            <Brand config={config} schoolName={schoolName} compact="never" />
            <button
              type="button"
              onClick={() => closeDrawer(true)}
              aria-label="Close menu"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <SidebarNav
            config={config}
            pathname={pathname}
            variant="drawer"
            collapsed={false}
            onNavigate={() => closeDrawer(false)}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-navigation"
            className="-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors duration-150 hover:bg-muted md:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>

          <Breadcrumbs config={config} pathname={pathname} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
            <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-border" />
            <UserMenu
              name={userName}
              roleLabel={config.roleLabel}
              schoolName={schoolName}
              contextLine={contextLine}
            />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="app-content mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
