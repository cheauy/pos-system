"use client";
import OrderQrScanner from '@/components/order-qr-scanner';
import { realtimeTopic } from '@/lib/supabase/realtime-topic';

import Image from "next/image";
import Link from '@/components/ui/activity-link';
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
  ChevronRight,
  BadgePercent,
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  CheckCheck,
  CreditCard,
  Download,
  FileSearch,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  LockKeyhole,
  PackagePlus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  Settings2,
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
import { markNotificationsRead } from "./notifications/read-actions";
import { getAppUrl } from "@/lib/tenancy/domain";
import type { Permission } from "@/lib/auth/permissions";
import { usePosNavigationLock } from './pos-lock-provider';
import { posLockAllows } from '@/lib/pos/navigation-lock';

type MenuItem = {
  anyPermission?: Permission[];
  name: string;
  href: string;
  icon: ElementType;
  permission?: Permission;
};

type MenuGroup = {
  title: string;
  icon: ElementType;
  items: MenuItem[];
  href?: string;
  permission?: Permission;
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
  is_active?: boolean;
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
      { name: "POS", href: "/dashboard/pos", permission: "pos.access", icon: ShoppingCart },
      { name: "Orders", href: "/dashboard/orders", permission: "orders.view", icon: ReceiptText },
      { name: "Promotions & Loyalty", href: "/dashboard/promotions", permission: "business.view", icon: BadgePercent },
      { name: "Returns", href: "/dashboard/returns", permission: "orders.return", icon: RotateCcw },
      { name: "Customers", href: "/dashboard/customers", permission: "customers.view", icon: Users },
    ],
  },
  {
    title: "Inventory",
    icon: Boxes,
    items: [
      { name: "Products & Stock", href: "/dashboard/products", anyPermission: ["products.view", "inventory.view"], icon: Boxes },
      { name: "Bundle Items", href: "/dashboard/bundles", permission: "products.view", icon: PackagePlus },
      { name: "Stock Transfers", href: "/dashboard/stock-transfers", permission: "transfers.manage", icon: ArrowRightLeft },
      { name: "Categories", href: "/dashboard/categories", permission: "categories.manage", icon: Tags },
      { name: "Barcode & Labels", href: "/dashboard/barcodes", permission: "inventory.view", icon: Barcode },
    ],
  },
  {
    title: "Supplier",
    icon: Truck,
    items: [
      { name: "All Suppliers", href: "/dashboard/suppliers", permission: "suppliers.manage", icon: Truck },
      { name: "Purchase Orders", href: "/dashboard/purchase-orders", permission: "purchases.view", icon: PackagePlus },
    ],
  },
  {
    title: "Finance",
    icon: WalletCards,
    items: [
      { name: "Reports", href: "/dashboard/reports", permission: "reports.view", icon: BarChart3 },
      { name: "Staff Report", href: "/dashboard/staff-report", permission: "reports.view", icon: Users },
      { name: "Expenses", href: "/dashboard/expenses", permission: "expenses.manage", icon: WalletCards },
      { name: "Cash Register", href: "/dashboard/register", permission: "register.manage", icon: Landmark },
    ],
  },
  {
    title: "Subscription",
    href: "/dashboard/settings/subscription",
    icon: CreditCard,
    permission: "business.update",
    items: [
      { name: "Subscription & Plan", href: "/dashboard/settings/subscription", permission: "business.update", icon: CreditCard },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { name: "General", href: "/dashboard/settings", permission: "business.view", icon: Settings },
      { name: "User & Manage User", href: "/dashboard/settings/users", permission: "users.view", icon: Users },
      { name: "Branches", href: "/dashboard/locations", permission: "locations.manage", icon: Store },
      { name: "Printer", href: "/dashboard/settings/printers", permission: "business.update", icon: Printer },
      { name: "Backup & Export", href: "/dashboard/exports", permission: "exports.manage", icon: Download },
      { name: "Audit Logs", href: "/dashboard/audit-logs", permission: "audit_logs.view", icon: FileSearch },
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
  "Credit Accounts / Settings",
];

export default function SidebarClient({ businessId, branchId, effectivePermissions }: { businessId: string; branchId: string; effectivePermissions: Permission[] }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = () => setIsMobileOpen(true);
    const close = () => setIsMobileOpen(false);
    window.addEventListener('tenh:open-navigation', open);
    window.addEventListener('tenh:close-navigation', close);
    return () => { window.removeEventListener('tenh:open-navigation', open); window.removeEventListener('tenh:close-navigation', close); };
  }, []);
  useEffect(() => {
    if (!isMobileOpen) return;
    const dialog = drawer.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 768px) and (orientation: landscape), (min-width: 1025px)');
    const resize = () => { if (desktop.matches) setIsMobileOpen(false); };
    desktop.addEventListener('change', resize);
    return () => { desktop.removeEventListener('change', resize); dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [isMobileOpen]);
  const groups = useMemo(() => filterMenuGroups(effectivePermissions), [effectivePermissions]);

  return (
    <>
      {isMobileOpen && (
        <dialog ref={drawer} aria-label="Dashboard navigation" className="workspace-mobile-navigation" onCancel={() => setIsMobileOpen(false)}>
          <button
            type="button"
            aria-label="Close dashboard navigation"
            onClick={() => setIsMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
          />

          <aside data-sidebar="true"
            aria-label="Dashboard navigation"
            className="absolute inset-y-0 left-0 w-[min(26rem,100vw)] overflow-hidden border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          >
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close dashboard navigation"
              className="absolute right-3 top-3 z-30 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={20} />
            </button>

            <MobileDrawerNav pathname={pathname} groups={groups} onNavigate={() => setIsMobileOpen(false)} />
          </aside>
        </dialog>
      )}

      <div className="fixed inset-y-0 left-0 z-50 hidden md:block">
        <SidebarShell key={branchId} pathname={pathname} businessId={businessId} branchId={branchId} groups={groups} />
      </div>
    </>
  );
}

function SidebarShell({
  pathname,
  businessId, branchId,
  groups,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  businessId: string; branchId: string;
  groups: MenuGroup[];
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const routeGroup = useMemo(() => getActiveGroup(pathname, groups), [pathname, groups]);
  const {locked:posLocked}=usePosNavigationLock();
  const searchRoute = isSearchRoute(pathname);
  const notificationsRoute = isNotificationsRoute(pathname);
  const shellRef = useRef<HTMLDivElement>(null);
  const [openGroupTitle, setOpenGroupTitle] = useState<string | null>(
    mobile && !isDirectRailRoute(pathname) ? routeGroup?.title ?? null : null,
  );
  const [selectedPanel, setSpecialPanel] = useState<SpecialPanel>(
    mobile && searchRoute
      ? "search"
      : mobile && notificationsRoute
        ? "notifications"
        : null,
  );
  const specialPanel=posLocked?null:selectedPanel;
  const [query, setQuery] = useState("");
  useEffect(() => {
    const close = () => { setOpenGroupTitle(null); setSpecialPanel(null); };
    window.addEventListener('tenh:close-navigation', close);
    return () => window.removeEventListener('tenh:close-navigation', close);
  }, []);
  const notifications = useBusinessNotifications(businessId, branchId);

  useEffect(() => {
    const onGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (!posLocked && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpenGroupTitle(null);
        setSpecialPanel("search");
      }
    };
    window.addEventListener("keydown", onGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", onGlobalSearchShortcut);
  }, [posLocked]);

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
    setOpenGroupTitle(isDirectRailRoute(pathname) ? null : routeGroup?.title ?? null);
  }, [mobile, pathname, routeGroup?.title]);

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
    ? groups.find((group) => group.title === openGroupTitle) ?? null
    : null;

  const closePanels = () => {
    setOpenGroupTitle(null);
    setSpecialPanel(null);
  };

  // Close the flyout for every selected destination, including the current page.
  const handleNavigate = () => {
    closePanels();
    onNavigate?.();
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
    <div ref={shellRef} className="sidebar-accent h-full">
      <IconRail
        pathname={pathname}
        groups={groups}
        openGroupTitle={openGroupTitle}
        specialPanel={specialPanel}
        unreadCount={notifications.unread}
        subscriptionUnreadCount={notifications.subscriptionUnread}
        onSelect={toggleGroup}
        onSearch={() => toggleSpecialPanel("search")}
        onNotifications={() => toggleSpecialPanel("notifications")}
        onDirectNavigate={handleNavigate}
        mobile={mobile}
      />

      {notifications.toast ? (
        <PaymentNotificationToast
          notification={notifications.toast}
          onClose={notifications.dismissToast}
          onNavigate={() => {
            notifications.dismissToast();
            handleNavigate();
          }}
        />
      ) : null}

      {mobile ? (
        <div className="sidebar-surface absolute inset-y-0 left-16 right-0 border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          {specialPanel === "search" ? (
            <GlobalSearchPanel
              query={query}
              onQueryChange={setQuery}
              onNavigate={handleNavigate}
              mobile
            />
          ) : specialPanel === "notifications" ? (
            <NotificationPanel
              notifications={notifications}
              onNavigate={handleNavigate}
              mobile
            />
          ) : openGroup ? (
            <NavigationPanel
              group={openGroup}
              pathname={pathname}
              onNavigate={handleNavigate}
              mobile
            />
          ) : (
            <MobileRailHome groups={groups} onSelect={toggleGroup} onNavigate={handleNavigate}/>
          )}
        </div>
      ) : specialPanel === "search" ? (
        <div className="sidebar-surface fixed bottom-3 left-[72px] top-3 z-[60] w-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900">
          <GlobalSearchPanel
            query={query}
            onQueryChange={setQuery}
            onClose={() => setSpecialPanel(null)}
            onNavigate={handleNavigate}
          />
        </div>
      ) : specialPanel === "notifications" ? (
        <div className="sidebar-surface fixed bottom-[84px] left-[72px] z-[70] w-[390px] max-w-[calc(100vw-92px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] dark:border-slate-700 dark:bg-slate-900">
          <NotificationPanel
            notifications={notifications}
            onClose={() => setSpecialPanel(null)}
            onNavigate={handleNavigate}
          />
        </div>
      ) : openGroup ? (
        <div className="sidebar-surface fixed bottom-3 left-[72px] top-3 z-[60] w-[270px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900">
          <NavigationPanel
            group={openGroup}
            pathname={pathname}
            onClose={() => setOpenGroupTitle(null)}
            onNavigate={handleNavigate}
          />
        </div>
      ) : null}
    </div>
  );
}

function IconRail({
  pathname,
  groups,
  openGroupTitle,
  specialPanel,
  unreadCount,
  subscriptionUnreadCount,
  onSelect,
  onSearch,
  onNotifications,
  onDirectNavigate,
  mobile,
}: {
  pathname: string;
  groups: MenuGroup[];
  openGroupTitle: string | null;
  specialPanel: SpecialPanel;
  unreadCount: number;
  subscriptionUnreadCount: number;
  onSelect: (title: string) => void;
  onSearch: () => void;
  onNotifications: () => void;
  onDirectNavigate?: () => void;
  mobile: boolean;
}) {
  const routeGroup = getActiveGroup(pathname, groups);
  const {locked:posLocked}=usePosNavigationLock();
  const directRailRoute = isDirectRailRoute(pathname);
  // An open panel owns the highlight; otherwise the current route does. Only one rail item is ever active.
  const panelShown = Boolean(openGroupTitle || specialPanel);

  return (
    <aside data-sidebar="true"
      className={`sidebar-surface sidebar-accent relative flex h-full shrink-0 flex-col items-center border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${
        mobile ? "w-16" : "w-16 shadow-[4px_0_18px_rgba(15,23,42,0.03)]"
      }`}
    >
      <div className="flex h-20 w-full items-center justify-center border-b border-slate-100 dark:border-slate-800">
        <Link
          href={posLocked?'/dashboard/pos':'/dashboard'}
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

      <nav className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <RailActionButton
          label="Global Search"
          icon={Search}
          active={specialPanel === "search" || (!panelShown && isSearchRoute(pathname))}
          mobile={mobile}
          onClick={onSearch}
        />

        <RailDirectLink
          href="/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          active={!panelShown && pathname === "/dashboard"}
          mobile={mobile}
          onNavigate={onDirectNavigate}
        />

        {groups.map((group) => {
          if (group.href) {
            return (
              <RailDirectLink
                key={group.title}
                href={group.href}
                label={group.title}
                icon={group.icon}
                active={!panelShown && isSubscriptionRoute(pathname)}
                mobile={mobile}
                onNavigate={onDirectNavigate}
                badge={group.title === "Subscription" ? subscriptionUnreadCount : 0}
              />
            );
          }

          const GroupIcon = group.icon;
          const blocked=posLocked&&group.items.every(item=>!posLockAllows(item.href));
          const panelOpen = openGroupTitle === group.title;
          const routeActive =
            !directRailRoute && routeGroup?.title === group.title;
          const active = panelShown ? panelOpen : routeActive;

          return (
            <div key={group.title} className="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={() => onSelect(group.title)}
                disabled={blocked}
                aria-label={`${group.title}${blocked?' · Locked':''}`}
                aria-expanded={panelOpen}
                className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-300"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <GroupIcon size={20} strokeWidth={2} />
                {group.title === "Subscription" && subscriptionUnreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{subscriptionUnreadCount}</span>}
                {blocked&&<LockKeyhole size={11} className="absolute bottom-1 right-1"/>}
                {routeActive && !panelOpen ? (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-950" />
                ) : null}
              </button>

              {!mobile && !panelOpen ? (
                <RailTooltip label={`${group.title}${blocked?' · Locked':''}`} />
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="flex w-full flex-col items-center gap-2 border-t border-slate-100 px-2 py-4 dark:border-slate-800">
        <RailActionButton
          label="Notifications"
          icon={Bell}
          active={specialPanel === "notifications" || (!panelShown && isNotificationsRoute(pathname))}
          mobile={mobile}
          onClick={onNotifications}
          badge={unreadCount}
        />
        <RailDirectLink
          href="/dashboard/settings/profile"
          label="Profile"
          icon={UserRound}
          active={
            !panelShown &&
            (pathname === "/dashboard/settings/profile" ||
              pathname.startsWith("/dashboard/settings/profile/"))
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
  const {locked}=usePosNavigationLock();
  return (
    <div className="group relative flex w-full justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        aria-label={`${label}${locked?' · Locked':''}`}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? "bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-300"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        }`}
      >
        <Icon size={20} strokeWidth={2} />
        {locked&&<LockKeyhole size={11} className="absolute bottom-1 right-1"/>}
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
  badge = 0,
}: {
  href: string;
  label: string;
  icon: ElementType;
  active: boolean;
  mobile: boolean;
  onNavigate?: () => void;
  badge?: number;
}) {
  const {locked}=usePosNavigationLock();
  if(locked&&!posLockAllows(href))return <div className="group relative flex w-full justify-center"><span role="link" aria-disabled="true" aria-label={`${label} · Locked`} title={`${label} · Locked`} className="relative flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl text-slate-400 opacity-40"><Icon size={20}/><LockKeyhole size={11} className="absolute bottom-1 right-1"/></span>{!mobile&&<RailTooltip label={`${label} · Locked`}/>}</div>;
  return (
    <div className="group relative flex w-full justify-center">
      <Link
        href={href}
        onClick={onNavigate}
        aria-label={label}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 ${
          active
            ? "bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-300"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        }`}
      >
        <Icon size={20} strokeWidth={2} />
        {badge > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[9px] font-black leading-4 text-white ring-2 ring-white dark:ring-slate-950">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
      {!mobile ? <RailTooltip label={label} /> : null}
    </div>
  );
}

function PaymentNotificationToast({
  notification,
  onClose,
  onNavigate,
}: {
  notification: NotificationRow;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const tone =
    notification.severity === "success"
      ? "border-emerald-200 bg-emerald-50/95 dark:border-emerald-900 dark:bg-emerald-950/95"
      : notification.severity === "critical"
        ? "border-red-200 bg-red-50/95 dark:border-red-900 dark:bg-red-950/95"
        : notification.severity === "warning"
          ? "border-amber-200 bg-amber-50/95 dark:border-amber-900 dark:bg-amber-950/95"
          : "border-blue-200 bg-blue-50/95 dark:border-blue-900 dark:bg-blue-950/95";

  return (
    <div role="status" aria-live="polite" className={`fixed right-4 top-4 z-[110] w-[min(390px,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl backdrop-blur ${tone}`}>
      <div className="flex items-start gap-3">
        <Bell size={19} className="mt-0.5 shrink-0 text-slate-700 dark:text-slate-200" />
        <Link href={notification.href ?? "/dashboard/notifications"} onClick={onNavigate} className="min-w-0 flex-1">
          <p className="font-extrabold text-slate-950 dark:text-white">{notification.title}</p>
          <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{notification.message}</p>
        </Link>
        <button type="button" onClick={onClose} aria-label="Dismiss notification" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:hover:bg-slate-900/60 dark:hover:text-white">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function RailSignOutButton({
  mobile,
  onNavigate,
  withLabel = false,
}: {
  mobile: boolean;
  onNavigate?: () => void;
  withLabel?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      onNavigate?.();
      window.location.assign(getAppUrl("/login"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="group relative flex w-full justify-center">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          aria-label="Sign out"
          className={`${withLabel ? "min-h-12 w-full justify-start gap-3 px-3 text-sm font-semibold" : "h-11 w-11 justify-center"} flex items-center rounded-xl text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300`}
        >
          {pending ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <LogOut size={20} strokeWidth={2} />
          )}
          {withLabel ? <span>{pending ? "Signing out..." : "Sign out"}</span> : null}
        </button>
        {!mobile ? <RailTooltip label={pending ? "Signing out..." : "Sign out"} /> : null}
      </div>

      {confirmOpen ? (
        <div
          className="sidebar-neutral fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setConfirmOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidebar-signout-title"
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <TriangleAlert size={23} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-red-600 dark:text-red-300">
                      Sign out
                    </p>
                    <h2 id="sidebar-signout-title" className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                      Sign out of TENH POS?
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close sign out confirmation"
                    disabled={pending}
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <X size={19} />
                  </button>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  You will need to sign in again to access this workspace.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmOpen(false)}
                    className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void signOut()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                    {pending ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
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
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('tenh:close-navigation'));
      router.push(`/dashboard/search?q=${encodeURIComponent(value)}`);
    }, 450);
    return () => clearTimeout(timer);
  }, [query, router]);

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
          <div className="relative block">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              autoFocus={!mobile}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search anything…"
              aria-label="Global search"
              style={{ paddingRight: 56 }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2"><OrderQrScanner onNavigate={onNavigate}/></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Type at least 2 characters to search.</p>
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

      {notifications.readError && <p role="alert" className="px-4 py-2 text-sm text-red-600">{notifications.readError}</p>}
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

/** Phones/tablets: one labeled list with expandable groups instead of the icon rail. */
function MobileDrawerNav({ pathname, groups, onNavigate }: { pathname: string; groups: MenuGroup[]; onNavigate: () => void }) {
  const { locked } = usePosNavigationLock();
  const routeGroup = getActiveGroup(pathname, groups);
  const [openTitle, setOpenTitle] = useState<string | null>(isDirectRailRoute(pathname) ? null : routeGroup?.title ?? null);
  const listRef = useRef<HTMLElement>(null);
  // Keep the current page visible when the drawer opens on a long menu.
  useEffect(() => { listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" }); }, []);
  const row = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition";
  const idle = "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";
  const current = "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300";
  const direct = (href: string, label: string, Icon: ElementType, active: boolean) => locked && !posLockAllows(href)
    ? <span key={href} role="link" aria-disabled="true" className={`${row} cursor-not-allowed text-slate-400 opacity-60`}><Icon size={20} /><span className="flex-1">{label}</span><LockKeyhole size={14} /></span>
    : <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`${row} ${active ? current : idle}`}><Icon size={20} className="shrink-0" /><span className="min-w-0 flex-1 break-words">{label}</span></Link>;
  return (
    <div className="sidebar-surface flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 p-4 pr-14 dark:border-slate-800">
        <Image src="/tenh-pos-logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">TENH POS</p><h2 className="text-base font-bold">Menu</h2></div>
      </div>
      <nav ref={listRef} aria-label="Workspace pages" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
        {direct("/dashboard/search", "Global Search", Search, isSearchRoute(pathname))}
        {direct("/dashboard", "Dashboard", LayoutDashboard, pathname === "/dashboard")}
        {groups.map(group => {
          const Icon = group.icon;
          if (group.href) return direct(group.href, group.title, Icon, isSubscriptionRoute(pathname));
          const expanded = openTitle === group.title;
          const hasActive = group.items.some(item => isItemActive(pathname, item.href));
          return <div key={group.title}>
            <button type="button" aria-expanded={expanded} onClick={() => setOpenTitle(expanded ? null : group.title)} className={`${row} ${hasActive && !expanded ? current : idle}`}>
              <Icon size={20} className="shrink-0" /><span className="flex-1 text-left">{group.title}</span>
              <ChevronRight size={18} className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
            {expanded && <div className="ml-5 space-y-1 border-l border-slate-200 py-1 pl-3 dark:border-slate-700">
              {group.items.map(item => <NavigationLink key={item.name} item={item} pathname={pathname} onNavigate={onNavigate} />)}
            </div>}
          </div>;
        })}
      </nav>
      <div className="space-y-1 border-t border-slate-100 p-3 dark:border-slate-800">
        {direct("/dashboard/notifications", "Notifications", Bell, isNotificationsRoute(pathname))}
        {direct("/dashboard/settings/profile", "Profile", UserRound, pathname.startsWith("/dashboard/settings/profile"))}
        <RailSignOutButton mobile withLabel onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function MobileRailHome({groups,onSelect,onNavigate}:{groups:MenuGroup[];onSelect:(title:string)=>void;onNavigate?:()=>void}) {
  const {locked}=usePosNavigationLock();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 p-4 pr-14 dark:border-slate-800"><p className="text-xs font-semibold text-blue-600">TENH POS</p><h2 className="mt-1 text-lg font-bold">Workspace menu</h2></div>
      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {groups.map(group=>{const Icon=group.icon;const blocked=locked&&(group.href?!posLockAllows(group.href):group.items.every(item=>!posLockAllows(item.href)));const content=<><Icon size={20} className="shrink-0 text-blue-600"/><span className="flex-1 text-left">{group.title}</span>{blocked?<LockKeyhole size={16}/>:<ChevronRight size={16}/> }</>;const cls='flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold dark:border-slate-700';return group.href&&!blocked?<Link key={group.title} href={group.href} onClick={onNavigate} className={cls}>{content}</Link>:<button key={group.title} type="button" disabled={blocked} onClick={()=>onSelect(group.title)} className={`${cls} disabled:opacity-40`}>{content}</button>;})}
      </nav>
    </div>
  );
}

function NavigationPanel({
  group,
  pathname,
  onClose,
  onNavigate,
  mobile = false,
}: {
  group: MenuGroup;
  pathname: string;
  onClose?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const GroupIcon = group.icon;
  const visibleItems = group.items;

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
  const {locked}=usePosNavigationLock();
  if(locked&&!posLockAllows(item.href))return <span role="link" aria-disabled="true" className="flex min-h-10 cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 opacity-60"><Icon size={17}/><span className="flex-1">{item.name}</span><LockKeyhole size={13}/><span className="text-xs">Locked</span></span>;

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

function useBusinessNotifications(businessId: string, branchId: string) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    browser_enabled: false,
    sound_enabled: true,
  });
  const prefsRef = useRef(prefs);
  const seenIds = useRef<Set<string> | null>(null);
  const loadVersion = useRef(0);
  const [readError, setReadError] = useState("");
  const [toast, setToast] = useState<NotificationRow | null>(null);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const load = useCallback(
    async (announce = false, regenerate = true) => {
      const version = ++loadVersion.current;
      // Only the user id is needed to filter reads (RLS still applies), so the
      // local session avoids an Auth API round trip on every 30s tick.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      if (version !== loadVersion.current) return;
      if (seenIds.current === null) {
        setItems([]);
        setReadIds(new Set());
        setReadError("");
        setToast(null);
      }
      // The refresh RPC rewrites every active notification row, which emits
      // business_notifications realtime events. Loads caused by those events
      // only re-read, so a refresh can never trigger another refresh.
      if (regenerate) await supabase.rpc("refresh_business_notifications", {
        p_business_id: businessId,
      });

      const [
        { data: notifications, error: notificationsError },
        { data: prefData },
      ] = await Promise.all([
        supabase.rpc("tenh_branch_notifications", {p_business:businessId,p_branch:branchId}),
        supabase
          .from("business_notification_preferences")
          .select("browser_enabled,sound_enabled")
          .eq("business_id", businessId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (version !== loadVersion.current || notificationsError) return;
      const rows = ((notifications ?? []) as NotificationRow[]).filter(item => item.is_active !== false);
      const { data: reads, error: readsError } = rows.length
        ? await supabase.from("business_notification_reads").select("notification_id").eq("user_id", user.id).in("notification_id", rows.map(item => item.id))
        : { data: [], error: null };
      // Failed/stale reads must never turn previously read history into unread alerts.
      if (version !== loadVersion.current || readsError) return;
      const read = new Set(
        (reads ?? []).map(
          (row: { notification_id: string }) => row.notification_id,
        ),
      );
      const nextPrefs = (prefData ?? prefsRef.current) as NotificationPrefs;

      setItems(rows);
      setReadIds(read);
      setPrefs(nextPrefs);

      const newest = seenIds.current && rows.find(item => !read.has(item.id) && !seenIds.current!.has(item.id));
      seenIds.current = new Set([...(seenIds.current ?? []), ...rows.map(item => item.id)]);

      if (announce && newest) {

        if (newest && (isSubscriptionPaymentNotification(newest) || newest.notification_type === "new_order")) {
          setToast(newest);
        }

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

    },
    [businessId, branchId, supabase],
  );

  useEffect(() => {
    const versionRef = loadVersion;
    seenIds.current = null;
    void load(false);
    const onRead = () => void load(false, false);
    window.addEventListener("notifications-read", onRead);
    window.addEventListener("notification-preferences-changed", onRead);
    const hidden = () => typeof document !== "undefined" && document.hidden;
    // Realtime can deliver a burst (one event per rewritten row or order
    // update); coalesce it into one load.
    let burst: number | undefined;
    const soon = (regenerate: boolean) => {
      window.clearTimeout(burst);
      burst = window.setTimeout(() => void load(true, regenerate), 1000);
    };
    const changed = () => soon(true);
    const timer = window.setInterval(() => { if (!hidden()) void load(true); }, 30000);
    const onVisible = () => { if (!hidden()) void load(true); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    const channel = supabase
      .channel(realtimeTopic(`sidebar-notifications:${businessId}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "business_notification_reads" }, onRead)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "business_notifications",
          filter: `business_id=eq.${businessId}`,
        },
        () => soon(false),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_orders",
          filter: `business_id=eq.${businessId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `business_id=eq.${businessId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_orders",
          filter: `business_id=eq.${businessId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_transfers",
          filter: `business_id=eq.${businessId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_register_shifts",
          filter: `business_id=eq.${businessId}`,
        },
        changed,
      )
      .subscribe();

    return () => {
      ++versionRef.current;
      window.removeEventListener("notifications-read", onRead);
      window.removeEventListener("notification-preferences-changed", onRead);
      window.clearInterval(timer);
      window.clearTimeout(burst);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [businessId, load, supabase]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const unread = items.filter((item) => !readIds.has(item.id)).length;
  const subscriptionUnread = items.filter(
    (item) => !readIds.has(item.id) && isSubscriptionPaymentNotification(item),
  ).length;

  const markRead = async (id: string) => {
    await saveReads([id]);
  };

  const markAllRead = async () => {
    await saveReads(items.filter(item => !readIds.has(item.id)).map(item => item.id));
  };

  const saveReads = async (ids: string[]) => {
    try {
      await markNotificationsRead(ids);
      ++loadVersion.current;
      setReadIds(current => new Set([...current, ...ids]));
      setReadError("");
      window.dispatchEvent(new Event("notifications-read"));
    } catch {
      setReadError("Unable to mark notifications as read. Please try again.");
    }
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
    readError,
    readIds,
    prefs,
    unread,
    subscriptionUnread,
    toast,
    dismissToast: () => setToast(null),
    markRead,
    markAllRead,
    toggleSound,
    enableBrowser,
  };
}

function isSubscriptionPaymentNotification(item: NotificationRow) {
  return item.notification_type.startsWith("subscription_");
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

function filterMenuGroups(effectivePermissions: Permission[]): MenuGroup[] {
  const allowed = new Set<Permission>(effectivePermissions);
  return menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.anyPermission ? item.anyPermission.some(permission => allowed.has(permission)) : !item.permission || allowed.has(item.permission)),
    }))
    .filter((group) =>
      group.href
        ? !group.permission || allowed.has(group.permission)
        : group.items.length > 0,
    );
}

// No fallback group: an unmatched route must not highlight Sales/POS.
function getActiveGroup(pathname: string, groups: MenuGroup[]): MenuGroup | null {
  return groups.find((group) =>
    group.items.some((item) => isItemActive(pathname, item.href)),
  ) ?? null;
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
    isSubscriptionRoute(pathname) ||
    pathname === "/dashboard" ||
    isSearchRoute(pathname) ||
    pathname === "/dashboard/settings/profile" ||
    pathname.startsWith("/dashboard/settings/profile/") ||
    isNotificationsRoute(pathname)
  );
}

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard/products" && (pathname === "/dashboard/inventory" || pathname.startsWith("/dashboard/inventory/"))) return true;
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  if (href === "/dashboard/settings/printers") {
    return pathname.startsWith("/dashboard/settings/printers") || pathname.startsWith("/dashboard/settings/receipts");
  }

  // General owns every settings page (Business Settings and its sections included)
  // except those with their own menu entry or rail link.
  if (href === "/dashboard/settings") {
    return (
      (pathname === href || pathname.startsWith(`${href}/`)) &&
      !["users", "printers", "receipts", "subscription", "profile"].some(
        (own) => pathname === `${href}/${own}` || pathname.startsWith(`${href}/${own}/`),
      )
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
