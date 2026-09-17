"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  CirclePlus,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

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

  const items: RailItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Businesses",
      href: "/super-admin/businesses",
      icon: Building2,
    },
    {
      label: "Manual Payments",
      href: "/super-admin/manual-payments",
      icon: BadgeDollarSign,
      badge: pendingPayments,
    },
    {
      label: "Subscription Payments",
      href: "/super-admin/subscription-payments",
      icon: CreditCard,
      badge: pendingSubscriptionPayments,
    },
    {
      label: "New Business",
      href: "/super-admin/businesses/new",
      icon: CirclePlus,
    },
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
      return pathname.startsWith("/super-admin/manual-payments");
    }

    if (item.href === "/super-admin/subscription-payments") {
      return pathname.startsWith("/super-admin/subscription-payments");
    }

    return pathname === item.href;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 hidden w-16 flex-col items-center border-r border-slate-200 bg-white py-3 shadow-[4px_0_18px_rgba(15,23,42,0.04)] lg:flex"
      aria-label="Super Admin menu"
    >
      <RailTooltip label="Super Admin">
        <Link
          href="/super-admin/businesses"
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
