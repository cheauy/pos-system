"use client";

import Link from '@/components/ui/activity-link';
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Building2,
  HeartPulse,
  Headphones,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Percent,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import FixedWorkspaceHeader from "@/components/ui/fixed-workspace-header";

type SuperAdminSideRailProps = {
  pendingPayments?: number;
  pendingSubscriptionPayments?: number;
};

type RailItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

function displayBadge(value?: number) {
  if (!value || value <= 0) return null;
  return value > 99 ? "99+" : String(value);
}

export default function SuperAdminSideRail({
  pendingPayments = 0,
  pendingSubscriptionPayments = 0,
}: SuperAdminSideRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const drawer = useRef<HTMLDialogElement>(null);

  const items: RailItem[] = [
    {
      label: "Dashboard",
      href: "/super-admin",
      icon: LayoutDashboard,
    },
    {
      label: "Businesses",
      href: "/super-admin/businesses",
      icon: Building2,
    },
    { label: "User Update Alerts", href: "/super-admin/update-alerts", icon: Megaphone },
    { label: "Plan discounts", href: "/super-admin/discounts", icon: Percent },
    {
      label: "Payment Approval",
      href: "/super-admin/manual-payments",
      icon: BadgeDollarSign,
      badge: pendingPayments + pendingSubscriptionPayments,
    },
    {
      label: "Website Health",
      href: "/super-admin/health",
      icon: HeartPulse,
    },
    { label: "Support", href: "/super-admin/support", icon: Headphones },
  ];

  function itemIsActive(item: RailItem) {
    const onNewBusiness = pathname.startsWith("/super-admin/businesses/new");

    if (item.href === "/super-admin/businesses/new") {
      return onNewBusiness;
    }

    if (item.href === "/super-admin/businesses") {
      return pathname.startsWith("/super-admin/businesses") && !onNewBusiness;
    }

    if (item.href === "/super-admin/manual-payments") {
      return pathname.startsWith("/super-admin/manual-payments") || pathname.startsWith("/super-admin/subscription-payments");
    }

    return pathname === item.href;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // The drawer only exists below lg; close it if the window grows to the desktop rail.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px) and (orientation: landscape), (min-width: 1025px)");
    const close = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  const openDrawer = () => drawer.current?.showModal();
  const closeDrawer = () => drawer.current?.close();
  const current = items.find(itemIsActive);
  const totalBadge = displayBadge(pendingPayments + pendingSubscriptionPayments);

  return (
    <>
    <FixedWorkspaceHeader className="lg:hidden"><header
      data-super-admin-header
      className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(.75rem,env(safe-area-inset-top))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:hidden"
    >
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open Super Admin navigation"
        aria-haspopup="dialog"
        aria-controls="super-admin-drawer"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Menu size={22} />
        {totalBadge ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
            {totalBadge}
          </span>
        ) : null}
      </button>
      <Link href="/super-admin" className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <ShieldCheck size={19} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-widest text-blue-600">Super Admin</span>
          <span className="block truncate text-sm font-bold text-slate-900">{current?.label ?? "Super Admin"}</span>
        </span>
      </Link>
    </header></FixedWorkspaceHeader>

    <dialog
      ref={drawer}
      id="super-admin-drawer"
      aria-label="Super Admin navigation"
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-slate-950/45 lg:hidden"
    >
      <button type="button" aria-label="Close Super Admin navigation" onClick={closeDrawer} className="absolute inset-0 cursor-default" tabIndex={-1} />
      <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <span className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ShieldCheck size={19} strokeWidth={2.2} /></span>
            Super Admin
          </span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close Super Admin navigation"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-label="Super Admin pages">
          {items.map((item) => {
            const Icon = item.icon;
            const active = itemIsActive(item);
            const badge = displayBadge(item.badge);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeDrawer}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                <Icon size={19} strokeWidth={2} className="shrink-0" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {badge ? (
                  <span className="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-extrabold leading-none text-white">{badge}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => { closeDrawer(); void handleSignOut(); }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <LogOut size={19} strokeWidth={2} />
            Sign Out
          </button>
        </div>
      </aside>
    </dialog>

    <aside
      className="fixed inset-y-0 left-0 z-50 hidden w-16 flex-col items-center border-r border-slate-200 bg-white py-3 shadow-[4px_0_18px_rgba(15,23,42,0.04)] lg:flex"
      aria-label="Super Admin menu"
    >
      <RailTooltip label="Super Admin">
        <Link
          href="/super-admin"
          aria-label="Super Admin"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"
        >
          <ShieldCheck size={22} strokeWidth={2.2} />
        </Link>
      </RailTooltip>

      <div className="mt-3 h-px w-8 bg-slate-200" />

      <nav className="mt-3 flex w-full flex-1 flex-col items-center gap-2" aria-label="Super Admin navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const active = itemIsActive(item);
          const badge = displayBadge(item.badge);

          return (
            <RailTooltip key={item.href} label={item.label}>
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative flex h-11 w-11 items-center justify-center rounded-2xl transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                  active
                    ? "bg-blue-100 text-blue-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                <Icon size={20} strokeWidth={2} />
                {badge ? (
                  <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </RailTooltip>
          );
        })}
      </nav>

      <div className="mb-2 h-px w-8 bg-slate-200" />

      <RailTooltip label="Sign Out">
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign Out"
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          <LogOut size={20} strokeWidth={2} />
        </button>
      </RailTooltip>
    </aside>
    </>
  );
}

function RailTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex justify-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-[70] ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-xl transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
      >
        {label}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-y-[5px] border-r-[6px] border-y-transparent border-r-slate-950" />
      </span>
    </div>
  );
}
