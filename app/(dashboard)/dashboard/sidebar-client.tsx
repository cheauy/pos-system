"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ElementType } from "react";

import {
  BadgePercent,
  Bell,
  Search,
  ArrowRightLeft,
  Building2,
  Download,
  HandCoins,
  Landmark,
  BarChart3,
  Barcode,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  Menu,
  Package,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingCart,
  ShoppingBag,
  Store,
  Tags,
  TriangleAlert,
  Truck,
  ScrollText,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type MenuItem = {
  name: string;
  href: string;
  icon: ElementType;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};


const menuGroups: MenuGroup[] = [
  {
    title: "Overview",
    items: [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        name: "Global Search",
        href: "/dashboard/search",
        icon: Search,
      },
      {
        name: "Notifications",
        href: "/dashboard/notifications",
        icon: Bell,
      },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        name: "POS",
        href: "/dashboard/pos",
        icon: ShoppingCart,
      },
      {
        name: "Orders",
        href: "/dashboard/orders",
        icon: ReceiptText,
      },
      {
        name: "Online Orders",
        href: "/dashboard/online-orders",
        icon: ShoppingBag,
      },
      {
        name: "Online Store",
        href: "/dashboard/online-store",
        icon: Store,
      },
      {
        name: "Promotions & Loyalty",
        href: "/dashboard/promotions",
        icon: BadgePercent,
      },
      {
        name: "Returns",
        href: "/dashboard/returns",
        icon: RotateCcw,
      },
      {
        name: "Customers",
        href: "/dashboard/customers",
        icon: Users,
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        name: "Inventory",
        href: "/dashboard/inventory",
        icon: Boxes,
      },
      {
        name: "Stock Transfers",
        href: "/dashboard/stock-transfers",
        icon: ArrowRightLeft,
      },
      {
        name: "Barcode & Labels",
        href: "/dashboard/barcodes",
        icon: Barcode,
      },
      {
        name: "Low Stock",
        href: "/dashboard/low-stock",
        icon: TriangleAlert,
      },
      {
        name: "Products",
        href: "/dashboard/products",
        icon: Package,
      },
      {
        name: "Suppliers",
        href: "/dashboard/suppliers",
        icon: Truck,
      },
      {
        name: "Purchase Orders",
        href: "/dashboard/purchase-orders",
        icon: PackagePlus,
      },
      {
        name: "Purchases",
        href: "/dashboard/purchases",
        icon: PackagePlus,
      },
      {
        name: "Categories",
        href: "/dashboard/categories",
        icon: Tags,
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        name: "Expenses",
        href: "/dashboard/expenses",
        icon: WalletCards,
      },
      {
        name: "Cash Register",
        href: "/dashboard/register",
        icon: Landmark,
      },
      {
        name: "Customer Credit",
        href: "/dashboard/customer-credit",
        icon: HandCoins,
      },
      {
        name: "Reports",
        href: "/dashboard/reports",
        icon: BarChart3,
      },
    ],
    
  },
 {
    title: "Settings",
    items: [
      {
        name: "Branches",
        href: "/dashboard/locations",
        icon: Building2,
      },
      {
        name: "Backup & Export",
        href: "/dashboard/exports",
        icon: Download,
      },
      {
        name: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
      },
      {
        
      name: "Audit Logs",
      href: "/dashboard/audit-logs",
     icon: ScrollText,
  
}
    ],
  },
  
];

export default function SidebarClient() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] =
    useState(false);

  return (
    <>
      {!isMobileOpen && (
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open dashboard navigation"
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 lg:hidden"
        >
          <Menu size={19} />
          Menu
        </button>
      )}

      {isMobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard navigation"
            onClick={() => setIsMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
            className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r border-slate-200 bg-white shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close dashboard navigation"
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X size={20} />
            </button>

            <SidebarPanel
              pathname={pathname}
              onNavigate={() =>
                setIsMobileOpen(false)
              }
            />
          </aside>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarPanel pathname={pathname} />
      </aside>
    </>
  );
}

function SidebarPanel({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-20 items-center border-b border-slate-200 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">
          P
        </div>

        <div className="ml-3">
          <h1 className="font-bold text-slate-900">
            TENH POS
          </h1>

          <p className="text-xs text-slate-500">
            Business Management
          </p>
        </div>
      </div>

      <nav className="h-[calc(100vh-5rem)] space-y-2 overflow-y-auto p-3">
        {menuGroups.map((group) =>
          group.title === "Overview" ? (
            <div key={group.title}>
              {group.items.map((item) => (
                <SidebarLink
                  key={item.name}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ) : (
            <SidebarGroup
              key={`${group.title}:${pathname}`}
              title={group.title}
              items={group.items}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ),
        )}
      </nav>
    </>
  );
}

function SidebarGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: MenuItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const containsActiveItem = items.some((item) =>
    isItemActive(pathname, item.href),
  );

  const [isOpen, setIsOpen] = useState(
    containsActiveItem,
  );

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() =>
          setIsOpen((current) => !current)
        }
        className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition ${
          containsActiveItem
            ? "bg-slate-100 text-slate-900"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span>{title}</span>

        <ChevronDown
          size={17}
          className={`transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-200 ${
          isOpen
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-2">
            {items.map((item) => (
              <SidebarLink
                key={item.name}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: MenuItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isItemActive(
    pathname,
    item.href,
  );

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon size={19} />

      <span>{item.name}</span>
    </Link>
  );
}

function isItemActive(
  pathname: string,
  href: string,
) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}
