"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Bell, ChevronDown, Loader2, LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";

interface UserMenuProps {
  name: string;
  roleLabel: string;
  schoolName: string;
  contextLine?: string | null;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

/** Account dropdown: identity summary, notifications and sign-out. */
export function UserMenu({ name, roleLabel, schoolName, contextLine }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 text-left transition-colors duration-150 hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground"
        >
          {initials(name)}
        </span>
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="block text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        <span className="sr-only">Open account menu</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right animate-pop-in rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-overlay)]"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {roleLabel} · {schoolName}
            </p>
            {contextLine ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{contextLine}</p>
            ) : null}
          </div>
          <div className="my-1 h-px bg-border" />
          <Link
            href="/notifications"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"
          >
            <Bell aria-hidden="true" className="size-4 text-muted-foreground" />
            Notifications
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() =>
              startSignOut(async () => {
                await logoutAction();
              })
            }
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
