"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type FormEvent,
} from "react";

import {
  ArrowRightLeft,
  BadgePercent,
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  CheckCheck,
  CreditCard,
  Download,
  FileSearch,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  Package,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  TriangleAlert,
  Truck,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  WalletCards,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getRootUrl } from "@/lib/tenancy/domain";

type MenuItem = {
  name: string;
  href: string;
  icon: ElementType;
};

type MenuGroup = {
  title: string;
  icon: ElementType;
  items: MenuItem[];
  href?: string;
};

type SpecialPanel = "search" | "notifications" | null;

type NotificationRow = {
  id: string;
  notification_type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  message: string;
  href: string | null;
  occurred_at: string;
};

type NotificationPrefs = {
  browser_enabled: boolean;
  sound_enabled: boolean;
};

const severityClass: Record<NotificationRow["severity"], string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

const menuGroups: MenuGroup[] = [
  {
    title: "Sales",
    icon: ShoppingCart,
    items: [
      { name: "POS", href: "/dashboard/pos", icon: ShoppingCart },
      { name: "Orders", href: "/dashboard/orders", icon: ReceiptText },
      { name: "Online Orders", href: "/dashboard/online-orders", icon: ShoppingBag },
      { name: "Online Store", href: "/dashboard/online-store", icon: Store },
      { name: "Promotions & Loyalty", href: "/dashboard/promotions", icon: BadgePercent },
      { name: "Marketing", href: "/dashboard/marketing", icon: Megaphone },
      { name: "Returns", href: "/dashboard/returns", icon: RotateCcw },
      { name: "Customers", href: "/dashboard/customers", icon: Users },
    ],
  },
  {
    title: "Inventory",
    icon: Boxes,
    items: [
      { name: "Inventory", href: "/dashboard/inventory", icon: Boxes },
      { name: "Stock Transfers", href: "/dashboard/stock-transfers", icon: ArrowRightLeft },
      { name: "Barcode & Labels", href: "/dashboard/barcodes", icon: Barcode },
      { name: "Products", href: "/dashboard/products", icon: Package },
      { name: "Categories", href: "/dashboard/categories", icon: Tags },
    ],
  },
  {
    title: "Supplier",
    icon: Truck,
    items: [
      { name: "All Suppliers", href: "/dashboard/suppliers", icon: Truck },
      { name: "Purchase Orders", href: "/dashboard/purchase-orders", icon: PackagePlus },
      { name: "Low Stock", href: "/dashboard/low-stock", icon: TriangleAlert },
    ],
  },
  {
    title: "Finance",
    icon: WalletCards,
    items: [
      { name: "Expenses", href: "/dashboard/expenses", icon: WalletCards },
      { name: "Cash Register", href: "/dashboard/register", icon: Landmark },
      { name: "Customer Credit", href: "/dashboard/customer-credit", icon: HandCoins },
      { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Subscription",
    icon: CreditCard,
    href: "/dashboard/settings/subscription",
    items: [],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { name: "General", href: "/dashboard/settings", icon: Settings },
      { name: "Branches", href: "/dashboard/locations", icon: Store },
      { name: "Backup & Export", href: "/dashboard/exports", icon: Download },
      { name: "Audit Logs", href: "/dashboard/audit-logs", icon: FileSearch },
    ],
  },
];

const searchScopes = [
  "Orders",
  "Products / SKU / Barcode",
  "Customers",
  "Suppliers",
  "Purchase Orders",
  "Stock Transfers",
  "Customer Credit",
];

export default function SidebarClient({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

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
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard navigation"
            onClick={() => setIsMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
            className="absolute inset-y-0 left-0 w-[min(24rem,96vw)] overflow-hidden border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          >
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close dashboard navigation"
              className="absolute right-3 top-3 z-30 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={20} />
            </button>

            <SidebarShell
              pathname={pathname}
              businessId={businessId}
              onNavigate={() => setIsMobileOpen(false)}
              mobile
            />
          </aside>
        </div>
      )}

      <div className="fixed inset-y-0 left-0 z-50 hidden lg:block">
        <SidebarShell pathname={pathname} businessId={businessId} />
      </div>
    </>
  );
}

function SidebarShell({
  pathname,
  businessId,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  businessId: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const routeGroup = useMemo(() => getActiveGroup(pathname), [pathname]);
  const searchRoute = isSearchRoute(pathname);
  const notificationsRoute = isNotificationsRoute(pathname);
  const shellRef = useRef<HTMLDivElement>(null);
  const [openGroupTitle, setOpenGroupTitle] = useState<string | null>(
    mobile && !isDirectRailRoute(pathname) ? routeGroup.title : null,
  );
  const [specialPanel, setSpecialPanel] = useState<SpecialPanel>(
    mobile && searchRoute
      ? "search"
      : mobile && notificationsRoute
        ? "notifications"
        : null,
  );
  const [query, setQuery] = useState("");
  const notifications = useBusinessNotifications(businessId);

  useEffect(() => {
    if (!mobile) return;

    if (isSearchRoute(pathname)) {
      setSpecialPanel("search");
      setOpenGroupTitle(null);
      return;
    }

    if (isNotificationsRoute(pathname)) {
      setSpecialPanel("notifications");
      setOpenGroupTitle(null);
      return;
    }

    setSpecialPanel(null);
    setOpenGroupTitle(isDirectRailRoute(pathname) ? null : routeGroup.title);
  }, [mobile, pathname, routeGroup.title]);

  useEffect(() => {
    setQuery("");
  }, [openGroupTitle, specialPanel]);

  useEffect(() => {
    if (mobile || (!openGroupTitle && !specialPanel)) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpenGroupTitle(null);
        setSpecialPanel(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenGroupTitle(null);
        setSpecialPanel(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobile, openGroupTitle, specialPanel]);

  const openGroup = openGroupTitle
    ? menuGroups.find((group) => group.title === openGroupTitle) ?? null
    : null;

  const closePanels = () => {
    setOpenGroupTitle(null);
    setSpecialPanel(null);
  };

  const toggleGroup = (title: string) => {
    setSpecialPanel(null);

    if (mobile) {
      setOpenGroupTitle(title);
      return;
    }

    setOpenGroupTitle((current) => (current === title ? null : title));
  };

  const toggleSpecialPanel = (panel: Exclude<SpecialPanel, null>) => {
    setOpenGroupTitle(null);
    setSpecialPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div ref={shellRef} className="h-full">
      <IconRail
        pathname={pathname}
        openGroupTitle={openGroupTitle}
        specialPanel={specialPanel}
        unreadCount={notifications.unread}
        onSelect={toggleGroup}
        onSearch={() => toggleSpecialPanel("search")}
        onNotifications={() => toggleSpecialPanel("notifications")}
        onDirectNavigate={() => {
          closePanels();
          onNavigate?.();
        }}
        mobile={mobile}
      />

      {mobile ? (
        <div className="absolute inset-y-0 left-16 right-0 border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          {specialPanel === "search" ? (
            <GlobalSearchPanel
              query={query}
              onQueryChange={setQuery}
              onNavigate={onNavigate}
              mobile
            />
          ) : specialPanel === "notifications" ? (
            <NotificationPanel
              notifications={notifications}
              onNavigate={onNavigate}
              mobile
            />
          ) : openGroup ? (
            <NavigationPanel
              group={openGroup}
              pathname={pathname}
              query={query}
              onQueryChange={setQuery}
              onNavigate={onNavigate}
              mobile
            />
          ) : (
            <MobileRailHome />
          )}
        </div>
      ) : specialPanel === "search" ? (
        <div className="fixed bottom-3 left-[72px] top-3 z-[60] w-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900">
          <GlobalSearchPanel
            query={query}
            onQueryChange={setQuery}
            onClose={() => setSpecialPanel(null)}
          />
        </div>
      ) : specialPanel === "notifications" ? (
        <div className="fixed bottom-[84px] left-[72px] z-[70] w-[390px] max-w-[calc(100vw-92px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] dark:border-slate-700 dark:bg-slate-900">
          <NotificationPanel
            notifications={notifications}
            onClose={() => setSpecialPanel(null)}
          />
        </div>
      ) : openGroup ? (
        <div className="fixed bottom-3 left-[72px] top-3 z-[60] w-[270px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900">
          <NavigationPanel
            group={openGroup}
            pathname={pathname}
            query={query}
            onQueryChange={setQuery}
            onClose={() => setOpenGroupTitle(null)}
            onNavigate={onNavigate}
          />
        </div>
      ) : null}
    </div>
  );
}

function IconRail({
  pathname,
  openGroupTitle,
  specialPanel,
  unreadCount,
  onSelect,
  onSearch,
  onNotifications,
  onDirectNavigate,
  mobile,
}: {
  pathname: string;
  openGroupTitle: string | null;
  specialPanel: SpecialPanel;
  unreadCount: number;
  onSelect: (title: string) => void;
  onSearch: () => void;
  onNotifications: () => void;
  onDirectNavigate?: () => void;
  mobile: boolean;
}) {
  const routeGroup = getActiveGroup(pathname);
  const directRailRoute = isDirectRailRoute(pathname);

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col items-center border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${
        mobile ? "w-16" : "w-16 shadow-[4px_0_18px_rgba(15,23,42,0.03)]"
      }`}
    >
      <div className="flex h-20 w-full items-center justify-center border-b border-slate-100 dark:border-slate-800">
        <Link
          href="/dashboard"
          onClick={onDirectNavigate}
          aria-label="TENH POS dashboard"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-300 dark:bg-slate-900 dark:ring-slate-700"
        >
          <Image
            src="/tenh-pos-logo.png"
            alt="TENH POS"
            width={44}
            height={44}
            priority
            className="h-full w-full rounded-lg object-contain"
          />
        </Link>
      </div>

      <nav className="flex w-full flex-1 flex-col items-center gap-2 overflow-hidden px-2 py-4">
        <RailActionButton
          label="Global Search"
          icon={Search}
          active={specialPanel === "search" || isSearchRoute(pathname)}
          mobile={mobile}
          onClick={onSearch}
        />

        <RailDirectLink
          href="/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          active={pathname === "/dashboard"}
          mobile={mobile}
          onNavigate={onDirectNavigate}
        />

        {menuGroups.map((group) => {
          if (group.href) {
            return (
              <RailDirectLink
                key={group.title}
                href={group.href}
                label={group.title}
                icon={group.icon}
                active={isSubscriptionRoute(pathname)}
                mobile={mobile}
                onNavigate={onDirectNavigate}
              />
            );
          }

          const GroupIcon = group.icon;
          const panelOpen = openGroupTitle === group.title;
          const routeActive =
            !directRailRoute && routeGroup.title === group.title;
          const active = panelOpen || routeActive;

          return (
            <div key={group.title} className="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={() => onSelect(group.title)}
                aria-label={group.title}
                aria-expanded={panelOpen}
                className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 ${
                  active
                    ? "bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-300"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <GroupIcon size={20} strokeWidth={2} />
                {routeActive && !panelOpen ? (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-950" />
                ) : null}
              </button>

              {!mobile && !panelOpen ? (
                <RailTooltip label={group.title} />
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="flex w-full flex-col items-center gap-2 border-t border-slate-100 px-2 py-4 dark:border-slate-800">
        <RailActionButton
          label="Notifications"
          icon={Bell}
          active={specialPanel === "notifications" || isNotificationsRoute(pathname)}
          mobile={mobile}
          onClick={onNotifications}
          badge={unreadCount}
        />
        <RailDirectLink
          href="/dashboard/settings/profile"
          label="Profile"
          icon={UserRound}
          active={
            pathname === "/dashboard/settings/profile" ||
            pathname.startsWith("/dashboard/settings/profile/")
          }
          mobile={mobile}
          onNavigate={onDirectNavigate}
        />
        <RailSignOutButton mobile={mobile} onNavigate={onDirectNavigate} />
      </div>
    </aside>
  );
}

function RailActionButton({
  label,
  icon: Icon,
  active,
  mobile,
  onClick,
  badge = 0,
}: {
  label: string;
  icon: ElementType;
  active: boolean;
  mobile: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 ${
          active
            ? "bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-300"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        }`}
      >
        <Icon size={20} strokeWidth={2} />
        {badge > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[9px] font-black leading-4 text-white ring-2 ring-white dark:ring-slate-950">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>
      {!mobile ? <RailTooltip label={label} /> : null}
    </div>
  );
}

function RailDirectLink({
  href,
  label,
  icon: Icon,
  active,
  mobile,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ElementType;
  active: boolean;
  mobile: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <Link
        href={href}
        onClick={onNavigate}
        aria-label={label}
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 ${
          active
            ? "bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-300"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        }`}
      >
        <Icon size={20} strokeWidth={2} />
      </Link>
      {!mobile ? <RailTooltip label={label} /> : null}
    </div>
  );
}


function RailSignOutButton({
  mobile,
  onNavigate,
}: {
  mobile: boolean;
  onNavigate?: () => void;
}) {
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      onNavigate?.();
      window.location.assign(getRootUrl("/login"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="group relative flex w-full justify-center">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={pending}
        aria-label="Sign out"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
      >
        {pending ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <LogOut size={20} strokeWidth={2} />
        )}
      </button>
      {!mobile ? <RailTooltip label={pending ? "Signing out..." : "Sign out"} /> : null}
    </div>
  );
}

function RailTooltip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[90] -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100">
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-y-[5px] border-r-[6px] border-y-transparent border-r-slate-950" />
    </div>
  );
}

function GlobalSearchPanel({
  query,
  onQueryChange,
  onClose,
  onNavigate,
  mobile = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClose?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const router = useRouter();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    onClose?.();
    onNavigate?.();
    router.push(`/dashboard/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`border-b border-slate-100 p-4 dark:border-slate-800 ${mobile ? "pr-12" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
              TENH POS
            </p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                <Search size={17} />
              </span>
              <h2 className="text-[15px] font-bold text-slate-950 dark:text-white">
                Global Search
              </h2>
            </div>
          </div>
          {!mobile && onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Global Search"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>

        <form onSubmit={submit} className="mt-4">
          <label className="relative block">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              autoFocus={!mobile}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Order #, SKU, barcode, customer..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950"
            />
          </label>
          <button
            type="submit"
            disabled={!query.trim()}
            className="mt-2.5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800"
          >
            Search TENH POS
          </button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Search across
        </p>
        <div className="mt-3 space-y-1">
          {searchScopes.map((scope) => (
            <div
              key={scope}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              <Search size={15} className="shrink-0 text-slate-400" />
              <span>{scope}</span>
            </div>
          ))}
        </div>
      </div>

      <Link
        href="/dashboard/search"
        onClick={() => {
          onClose?.();
          onNavigate?.();
        }}
        className="border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-blue-600 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
      >
        Open full Global Search
      </Link>
    </div>
  );
}

function NotificationPanel({
  notifications,
  onClose,
  onNavigate,
  mobile = false,
}: {
  notifications: ReturnType<typeof useBusinessNotifications>;
  onClose?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const {
    items,
    readIds,
    prefs,
    unread,
    markRead,
    markAllRead,
    toggleSound,
    enableBrowser,
  } = notifications;

  const closeAndNavigate = () => {
    onClose?.();
    onNavigate?.();
  };

  return (
    <div className="flex max-h-[min(34rem,calc(100vh-6rem))] min-h-0 flex-col">
      <div className={`flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 ${mobile ? "pr-12" : ""}`}>
        <div>
          <p className="text-[15px] font-bold text-slate-950 dark:text-white">Notifications</p>
          <p className="text-xs text-slate-500">{unread} unread</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={prefs.sound_enabled ? "Mute notification sound" : "Enable notification sound"}
            onClick={() => void toggleSound()}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {prefs.sound_enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          {!prefs.browser_enabled && typeof Notification !== "undefined" ? (
            <button
              type="button"
              title="Enable browser notifications"
              onClick={() => void enableBrowser()}
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Settings2 size={17} />
            </button>
          ) : null}
          <button
            type="button"
            title="Mark all read"
            onClick={() => void markAllRead()}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <CheckCheck size={18} />
          </button>
          {!mobile && onClose ? (
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Bell size={26} className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-500">No active notifications.</p>
          </div>
        ) : (
          items.slice(0, 8).map((item) => {
            const read = readIds.has(item.id);
            return (
              <Link
                key={item.id}
                href={item.href ?? "/dashboard/notifications"}
                onClick={() => {
                  void markRead(item.id);
                  closeAndNavigate();
                }}
                className={`flex gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70 ${
                  read ? "opacity-65" : ""
                }`}
              >
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityClass[item.severity]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {item.message}
                  </span>
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {formatNotificationDate(item.occurred_at)}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>

      <Link
        href="/dashboard/notifications"
        onClick={closeAndNavigate}
        className="border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-blue-600 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
      >
        View all notifications
      </Link>
    </div>
  );
}

function MobileRailHome() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
      Select an icon from the left rail.
    </div>
  );
}

function NavigationPanel({
  group,
  pathname,
  query,
  onQueryChange,
  onClose,
  onNavigate,
  mobile = false,
}: {
  group: MenuGroup;
  pathname: string;
  query: string;
  onQueryChange: (value: string) => void;
  onClose?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const GroupIcon = group.icon;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? group.items.filter((item) =>
        item.name.toLowerCase().includes(normalizedQuery),
      )
    : group.items;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`border-b border-slate-100 p-4 dark:border-slate-800 ${mobile ? "pr-12" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
              TENH POS
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <GroupIcon size={17} />
              </span>
              <h2 className="truncate text-[15px] font-bold text-slate-950 dark:text-white">
                {group.title}
              </h2>
            </div>
          </div>

          {!mobile && onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${group.title} menu`}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>

        <label className="relative mt-4 block">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`Search ${group.title.toLowerCase()}...`}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-3">
        {visibleItems.length > 0 ? (
          <div className="space-y-1">
            {visibleItems.map((item) => (
              <NavigationLink
                key={item.name}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-xs text-slate-400">
            No menu items found.
          </div>
        )}
      </nav>

      <div className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400 dark:border-slate-800">
        Select a page to continue
      </div>
    </div>
  );
}

function NavigationLink({
  item,
  pathname,
  onNavigate,
}: {
  item: MenuItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      }`}
    >
      <Icon
        size={17}
        strokeWidth={2}
        className={`shrink-0 ${active ? "text-blue-600 dark:text-blue-300" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"}`}
      />
      <span className="min-w-0 truncate">{item.name}</span>
    </Link>
  );
}

function useBusinessNotifications(businessId: string) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    browser_enabled: false,
    sound_enabled: true,
  });
  const prefsRef = useRef(prefs);
  const previousUnread = useRef(0);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const load = useCallback(
    async (announce = false) => {
      await supabase.rpc("refresh_business_notifications", {
        p_business_id: businessId,
      });

      const [
        { data: notifications },
        { data: reads },
        { data: prefData },
      ] = await Promise.all([
        supabase
          .from("business_notifications")
          .select(
            "id,notification_type,severity,title,message,href,occurred_at",
          )
          .eq("business_id", businessId)
          .eq("is_active", true)
          .order("occurred_at", { ascending: false })
          .limit(20),
        supabase.from("business_notification_reads").select("notification_id"),
        supabase
          .from("business_notification_preferences")
          .select("browser_enabled,sound_enabled")
          .eq("business_id", businessId)
          .maybeSingle(),
      ]);

      const rows = (notifications ?? []) as NotificationRow[];
      const read = new Set(
        (reads ?? []).map(
          (row: { notification_id: string }) => row.notification_id,
        ),
      );
      const nextPrefs = (prefData ?? prefsRef.current) as NotificationPrefs;

      setItems(rows);
      setReadIds(read);
      setPrefs(nextPrefs);

      const unread = rows.filter((item) => !read.has(item.id)).length;

      if (announce && unread > previousUnread.current) {
        const newest = rows.find((item) => !read.has(item.id));

        if (nextPrefs.sound_enabled) {
          try {
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.06, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(
              0.001,
              context.currentTime + 0.16,
            );
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.16);
          } catch {
            // Browsers may block sound before user interaction.
          }
        }

        if (
          nextPrefs.browser_enabled &&
          newest &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification(newest.title, { body: newest.message });
        }
      }

      previousUnread.current = unread;
    },
    [businessId, supabase],
  );

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 30000);
    const channel = supabase
      .channel(`sidebar-notifications:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "business_notifications",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_orders",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_transfers",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_register_shifts",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_credit_accounts",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(true),
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [businessId, load, supabase]);

  const unread = items.filter((item) => !readIds.has(item.id)).length;

  const markRead = async (id: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("business_notification_reads").upsert({
      notification_id: id,
      user_id: user.id,
      read_at: new Date().toISOString(),
    });
    setReadIds((current) => new Set(current).add(id));
  };

  const markAllRead = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || items.length === 0) return;

    await supabase.from("business_notification_reads").upsert(
      items.map((item) => ({
        notification_id: item.id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      })),
    );
    setReadIds(new Set(items.map((item) => item.id)));
  };

  const toggleSound = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const next = !prefs.sound_enabled;
    await supabase.from("business_notification_preferences").upsert({
      business_id: businessId,
      user_id: user.id,
      sound_enabled: next,
      browser_enabled: prefs.browser_enabled,
      updated_at: new Date().toISOString(),
    });
    setPrefs((current) => ({ ...current, sound_enabled: next }));
  };

  const enableBrowser = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("business_notification_preferences").upsert({
      business_id: businessId,
      user_id: user.id,
      browser_enabled: true,
      sound_enabled: prefs.sound_enabled,
      updated_at: new Date().toISOString(),
    });
    setPrefs((current) => ({ ...current, browser_enabled: true }));
  };

  return {
    items,
    readIds,
    prefs,
    unread,
    markRead,
    markAllRead,
    toggleSound,
    enableBrowser,
  };
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getActiveGroup(pathname: string): MenuGroup {
  const match = menuGroups.find((group) =>
    group.items.some((item) => isItemActive(pathname, item.href)),
  );

  return match ?? menuGroups[0];
}

function isSearchRoute(pathname: string) {
  return pathname === "/dashboard/search" || pathname.startsWith("/dashboard/search/");
}

function isNotificationsRoute(pathname: string) {
  return (
    pathname === "/dashboard/notifications" ||
    pathname.startsWith("/dashboard/notifications/")
  );
}

function isSubscriptionRoute(pathname: string) {
  return (
    pathname === "/dashboard/settings/subscription" ||
    pathname.startsWith("/dashboard/settings/subscription/")
  );
}

function isDirectRailRoute(pathname: string) {
  return (
    pathname === "/dashboard" ||
    isSearchRoute(pathname) ||
    isSubscriptionRoute(pathname) ||
    pathname === "/dashboard/settings/profile" ||
    pathname.startsWith("/dashboard/settings/profile/") ||
    isNotificationsRoute(pathname)
  );
}

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  if (href === "/dashboard/settings") {
    return (
      pathname === href ||
      pathname.startsWith("/dashboard/settings/system") ||
      pathname.startsWith("/dashboard/settings/security") ||
      pathname.startsWith("/dashboard/settings/receipts") ||
      pathname.startsWith("/dashboard/settings/users") ||
      pathname.startsWith("/dashboard/settings/business")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
