"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/browser";

type NavItem = { href: string; label: string; badge?: number };

export default function TopBar({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === "admin";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [decisionCount, setDecisionCount] = useState(0);
  const drawerRef = useRef<HTMLElement | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);

  const initials = profile.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  // ───────────── Notification counts ─────────────
  // Admin: live count of pending leave requests.
  // Staff: count of approved/rejected requests they haven't yet seen
  // (tracked via localStorage; cleared when they visit /my-requests).
  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    async function fetchCounts() {
      if (isAdmin) {
        const { count } = await supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        if (mounted) setPendingCount(count ?? 0);
        return;
      }

      // Staff path.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("leave_requests")
        .select("id")
        .eq("user_id", profile.id)
        .in("status", ["approved", "rejected"])
        .gte("decided_at", since);
      if (!mounted) return;
      const ids = (data ?? []).map((r) => r.id);
      const key = `bbm-seen-decisions-${profile.id}`;
      const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;

      if (raw === null) {
        // First-ever load: seed with current decisions so the user isn't
        // greeted with a badge for historical activity.
        if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(ids));
        setDecisionCount(0);
        return;
      }

      const seen: string[] = JSON.parse(raw);

      // Visiting /my-requests acknowledges all current decisions.
      if (pathname === "/dashboard/my-requests") {
        const merged = Array.from(new Set([...seen, ...ids]));
        localStorage.setItem(key, JSON.stringify(merged));
        setDecisionCount(0);
        return;
      }

      const unseen = ids.filter((id) => !seen.includes(id));
      setDecisionCount(unseen.length);
    }

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pathname, profile.id, isAdmin]);

  const links: NavItem[] = isAdmin
    ? [
        { href: "/admin", label: "Calendar" },
        { href: "/admin/whos-off", label: "Who's off" },
        { href: "/admin/requests", label: "Requests", badge: pendingCount },
        { href: "/admin/employees", label: "Employees" },
        { href: "/admin/invites", label: "Invites" },
        { href: "/admin/holidays", label: "Holidays" },
      ]
    : [
        { href: "/dashboard", label: "Who's off" },
        { href: "/dashboard/request", label: "Request leave" },
        { href: "/dashboard/my-requests", label: "My requests", badge: decisionCount },
      ];

  // Close on Escape, lock body scroll, focus the first interactive element on
  // open, trap focus inside the drawer, and restore focus to the hamburger
  // when it closes.
  useEffect(() => {
    if (!open) return;

    const drawer = drawerRef.current;
    const focusables = drawer
      ? Array.from(
          drawer.querySelectorAll<HTMLElement>(
            'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"))
      : [];
    focusables[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      hamburgerRef.current?.focus();
    };
  }, [open]);

  // Total count for the hamburger dot.
  const hamburgerCount = isAdmin ? pendingCount : decisionCount;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          <Link
            href={isAdmin ? "/admin" : "/dashboard"}
            className="flex items-center gap-2.5 text-brand-ink"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/blackbird-logo.svg"
              alt="Blackbird"
              width={120}
              height={20}
              priority
              className="h-5 w-auto"
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 border-l border-neutral-200 pl-2.5">
              Leave
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href} badge={l.badge}>
                {l.label}
              </NavLink>
            ))}

            <div className="mx-3 h-5 w-px bg-neutral-200" />

            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-700"
                aria-hidden
                title={profile.full_name}
              >
                {initials || "·"}
              </span>
              <span className="hidden lg:inline text-neutral-600 text-sm">{profile.full_name}</span>
            </div>

            <form action="/api/auth/logout" method="post" className="ml-2">
              <button className="rounded-md px-3 py-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition text-sm">
                Sign out
              </button>
            </form>
          </nav>

          {/* Hamburger (mobile) */}
          <button
            ref={hamburgerRef}
            type="button"
            onClick={() => setOpen(true)}
            className="md:hidden relative inline-flex h-11 w-11 -mr-2 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="primary-mobile-nav"
          >
            <BurgerIcon />
            {hamburgerCount > 0 && (
              <span className="absolute top-1 right-1 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-neutral-900/50 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Drawer. `inert` when closed removes the off-screen content from the
          a11y tree and tab order so keyboard users don't tab into hidden links. */}
      <aside
        ref={drawerRef}
        id="primary-mobile-nav"
        className={`fixed top-0 right-0 z-50 h-dvh w-[78vw] max-w-xs bg-white border-l border-neutral-200 shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          open ? "tranneutral-x-0" : "tranneutral-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        inert={!open}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-14 px-4 border-b border-neutral-200">
            <div className="flex items-center gap-2.5">
              <Image
                src="/blackbird-logo.svg"
                alt="Blackbird"
                width={108}
                height={18}
                className="h-[18px] w-auto"
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 border-l border-neutral-200 pl-2.5">
                Menu
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 w-11 -mr-2 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-md px-3 py-3 text-[15px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition"
              >
                <span>{l.label}</span>
                {l.badge !== undefined && l.badge > 0 && <Badge count={l.badge} />}
              </Link>
            ))}
          </nav>

          <div className="border-t border-neutral-200 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700">
                {initials || "·"}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-900 truncate">{profile.full_name}</div>
                <div className="text-xs text-neutral-500 truncate">{profile.email}</div>
              </div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn-secondary w-full">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  badge,
  children,
}: {
  href: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition"
    >
      <span>{children}</span>
      {badge !== undefined && badge > 0 && <Badge count={badge} />}
    </Link>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-none text-white tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function BurgerIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="1" y1="1" x2="17" y2="1" />
      <line x1="1" y1="7" x2="17" y2="7" />
      <line x1="1" y1="13" x2="17" y2="13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="1" y1="1" x2="13" y2="13" />
      <line x1="13" y1="1" x2="1" y2="13" />
    </svg>
  );
}
