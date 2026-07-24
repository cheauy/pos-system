"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ElementType } from "react";

import {
  BarChart3,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  Package,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingCart,
  Tags,
  TriangleAlert,
  Truck,
  User,
  ScrollText,
  Users,
  WalletCards,
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

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-20 items-center border-b border-slate-200 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">
          P
        </div>

        <div className="ml-3">
          <h1 className="font-bold text-slate-900">
            POS System
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
                />
              ))}
            </div>
          ) : (
            <SidebarGroup
              key={group.title}
              title={group.title}
              items={group.items}
              pathname={pathname}
            />
          ),
        )}
      </nav>
    </aside>
  );
}

function SidebarGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: MenuItem[];
  pathname: string;
}) {
  const containsActiveItem = items.some((item) =>
    isItemActive(pathname, item.href),
  );

  const [isOpen, setIsOpen] = useState(
    containsActiveItem,
  );

  useEffect(() => {
    if (containsActiveItem) {
      setIsOpen(true);
    }
  }, [containsActiveItem]);

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
}: {
  item: MenuItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const active = isItemActive(
    pathname,
    item.href,
  );

  return (
    <Link
      href={item.href}
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