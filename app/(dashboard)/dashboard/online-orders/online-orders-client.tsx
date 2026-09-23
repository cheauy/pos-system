"use client";

import Link from "next/link";
import OrderPrintMenu from "@/components/order-print-menu";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Filter,
  Grid2X2,
  List,
  Loader2,
  MoreHorizontal,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Truck,
  Utensils,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  updateOnlineOrderStatus,
  updateOnlinePaymentStatus,
} from "./actions";

type OrderItem = {
  image_url?: string | null;
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  variant_label: string | null;
  selected_options: Array<{
    name?: string;
    priceAdjustment?: number;
  }> | null;
};

export type OnlineOrder = {
  id: string;
  order_number: string;
  order_source: string;
  fulfillment_type: string | null;
  online_status: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_address: string | null;
  customer_note: string | null;
  table_name: string | null;
  delivery_zone_name: string | null;
  requested_for: string | null;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  loyalty_points_earned: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  order_items: OrderItem[];
};

type QueueFilter =
  | "all"
  | "new"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

type SortMode = "newest" | "oldest" | "highest" | "lowest";
type SourceFilter = "all" | "online" | "qr";
type FulfillmentFilter = "all" | "pickup" | "delivery" | "dine_in";
type ViewMode = "split" | "grid";

const ACTIVE_STATUSES = new Set(["new", "accepted", "preparing", "ready"]);

export default function OnlineOrdersClient({
  businessId, branchId,
  initialOrders,
  currency,
  canUpdate,
  canCancel,
}: {
  businessId: string;
  branchId: string;
  initialOrders: OnlineOrder[];
  currency: string;
  canUpdate: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [fulfillmentFilter, setFulfillmentFilter] =
    useState<FulfillmentFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrders.find((order) => isActive(order))?.id ?? initialOrders[0]?.id ?? null,
  );
  const newestOrderRef = useRef(initialOrders[0]?.id ?? null);

  const counts = useMemo(() => {
    return initialOrders.reduce(
      (acc, order) => {
        const grouped = queueStatus(order.online_status);
        if (grouped === "new") acc.new += 1;
        if (grouped === "preparing") acc.preparing += 1;
        if (grouped === "ready") acc.ready += 1;
        if (grouped === "completed") acc.completed += 1;
        if (grouped === "cancelled") acc.cancelled += 1;
        if (isActive(order)) acc.live += 1;
        return acc;
      },
      { new: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0, live: 0 },
    );
  }, [initialOrders]);

  const completedToday = useMemo(
    () =>
      initialOrders.filter(
        (order) =>
          queueStatus(order.online_status) === "completed" && isToday(order.created_at),
      ).length,
    [initialOrders],
  );

  const delayedOrders = useMemo(
    () =>
      initialOrders.filter(
        (order) =>
          ["new", "accepted"].includes(order.online_status ?? "new") &&
          minutesSince(order.created_at) >= 15,
      ),
    [initialOrders],
  );

  const averagePreparingMinutes = useMemo(() => {
    const preparing = initialOrders.filter(
      (order) => (order.online_status ?? "new") === "preparing",
    );
    if (preparing.length === 0) return null;
    return Math.round(
      preparing.reduce((total, order) => total + minutesSince(order.created_at), 0) /
        preparing.length,
    );
  }, [initialOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return initialOrders
      .filter((order) => {
        const grouped = queueStatus(order.online_status);
        const matchesStatus =
          statusFilter === "all" ? isActive(order) : grouped === statusFilter;
        if (!matchesStatus) return false;

        if (sourceFilter !== "all" && order.order_source !== sourceFilter) {
          return false;
        }

        const fulfillment = order.fulfillment_type ?? "pickup";
        if (fulfillmentFilter !== "all" && fulfillment !== fulfillmentFilter) {
          return false;
        }

        if (!normalizedQuery) return true;
        const haystack = [
          order.order_number,
          order.guest_name,
          order.guest_phone,
          order.guest_address,
          order.table_name,
          order.delivery_zone_name,
          order.customer_note,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortMode === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortMode === "highest") return Number(b.total) - Number(a.total);
        if (sortMode === "lowest") return Number(a.total) - Number(b.total);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [initialOrders, query, statusFilter, sourceFilter, fulfillmentFilter, sortMode]);

  const selectedOrder = useMemo(
    () =>
      initialOrders.find((order) => order.id === selectedOrderId) ??
      filteredOrders[0] ??
      null,
    [initialOrders, selectedOrderId, filteredOrders],
  );

  useEffect(() => {
    try {
      setAlertsEnabled(window.localStorage.getItem("tenh-order-alerts") === "1");
      setSoundEnabled(window.localStorage.getItem("tenh-order-sound") !== "0");
      setAutoRefresh(window.localStorage.getItem("tenh-order-auto-refresh") !== "0");
    } catch {
      // Browser storage is optional.
    }
  }, []);

  useEffect(() => {
    if (filteredOrders.length === 0) return;
    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    setLastUpdatedAt(new Date());
  }, [initialOrders]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`online-orders:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          if ((payload.new as Record<string,unknown>).location_id !== branchId) return;
          const row = payload.new as Record<string, unknown>;
          if (
            payload.eventType === "INSERT" &&
            (row.order_source === "online" || row.order_source === "qr")
          ) {
            notifyNewOrder();
          }
          setLastUpdatedAt(new Date());
          router.refresh();
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    const poll = autoRefresh
      ? window.setInterval(() => {
          setLastUpdatedAt(new Date());
          router.refresh();
        }, 30000)
      : null;

    return () => {
      if (poll) window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [businessId, branchId, router, alertsEnabled, soundEnabled, autoRefresh]);

  useEffect(() => {
    const newestId = initialOrders[0]?.id ?? null;
    if (
      newestId &&
      newestOrderRef.current &&
      newestId !== newestOrderRef.current
    ) {
      notifyNewOrder();
    }
    newestOrderRef.current = newestId;
  }, [initialOrders]);

  function beep() {
    if (!soundEnabled) return;
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.06;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.16);
    } catch {
      // Audio feedback is optional.
    }
  }

  function notifyNewOrder() {
    beep();

    if (!alertsEnabled) return;
    toast.success("New online order received");

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Tenh POS - New online order", {
        body: "Open Online Orders to review the new customer order.",
      });
    }
  }

  async function enableAlerts() {
    if (!("Notification" in window)) {
      toast.error("Browser notifications are not supported here.");
      return;
    }

    if (Notification.permission === "denied") {
      toast.error("Notifications are blocked in your browser settings.");
      return;
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
    }

    setAlertsEnabled(true);
    window.localStorage.setItem("tenh-order-alerts", "1");
    beep();
    toast.success("Online order alerts enabled");
  }

  function toggleAlerts() {
    if (!alertsEnabled) {
      void enableAlerts();
      return;
    }
    setAlertsEnabled(false);
    window.localStorage.setItem("tenh-order-alerts", "0");
    toast.success("Desktop alerts turned off");
  }

  function toggleAutoRefresh() {
    const next = !autoRefresh;
    setAutoRefresh(next);
    window.localStorage.setItem("tenh-order-auto-refresh", next ? "1" : "0");
  }

  function refreshNow() {
    setLastUpdatedAt(new Date());
    router.refresh();
  }

  function changeStatus(
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "completed" | "rejected",
  ) {
    if (status === "rejected" ? !canCancel : !canUpdate) {
      toast.error(status === "rejected" ? "You do not have permission to cancel orders." : "You do not have permission to update orders.");
      return;
    }
    setPendingOrderId(orderId);
    startTransition(async () => {
      const result = await updateOnlineOrderStatus(orderId, status);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setPendingOrderId(null);
    });
  }

  function changePaymentStatus(
    orderId: string,
    status: "pending_verification" | "paid" | "unpaid",
  ) {
    if (!canUpdate) { toast.error("You do not have permission to update payments."); return; }
    setPendingOrderId(orderId);
    startTransition(async () => {
      const result = await updateOnlinePaymentStatus(orderId, status);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setPendingOrderId(null);
    });
  }

  function showDelayedOrder() {
    const order = delayedOrders[0];
    if (!order) return;
    setStatusFilter("all");
    setSelectedOrderId(order.id);
    setViewMode("split");
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[30px] font-bold leading-none tracking-[-0.025em] text-slate-950">
            Online Orders
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Live customer orders from your public store and table QR codes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAlerts}
            className={`inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold shadow-sm transition ${
              alertsEnabled
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {alertsEnabled ? <BellRing size={16} /> : <Bell size={16} />}
            {alertsEnabled ? "Alerts On" : "Enable Alerts"}
          </button>

          <ToggleButton
            active={autoRefresh}
            onClick={toggleAutoRefresh}
            label="Auto Refresh"
            sublabel="Every 30 seconds"
          />

          <button
            type="button"
            onClick={refreshNow}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} /> Refresh
          </button>


        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="New Orders"
          value={counts.new}
          icon={<ShoppingBag size={22} />}
          iconClass="bg-blue-50 text-blue-600"
          helper="Current queue"
        />
        <MetricCard
          label="Preparing"
          value={counts.preparing}
          icon={<ChefHat size={22} />}
          iconClass="bg-amber-50 text-amber-500"
          helper="In kitchen"
        />
        <MetricCard
          label="Ready"
          value={counts.ready}
          icon={<PackageCheck size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
          helper="Awaiting pickup"
        />
        <MetricCard
          label="Completed Today"
          value={completedToday}
          icon={<CheckCircle2 size={22} />}
          iconClass="bg-violet-50 text-violet-600"
          helper={`${counts.completed} total loaded`}
        />
        <MetricCard
          label="Cancelled"
          value={counts.cancelled}
          icon={<X size={22} />}
          iconClass="bg-rose-50 text-rose-500"
          helper="Rejected orders"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,2.2fr)_minmax(210px,0.9fr)_minmax(210px,0.9fr)]">
        {delayedOrders.length > 0 ? (
          <div className="flex min-h-[64px] items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Clock3 size={18} />
              </div>
              <p className="text-sm font-semibold text-amber-900">
                {delayedOrders.length} {delayedOrders.length === 1 ? "order has" : "orders have"} been waiting for more than 15 minutes.
              </p>
            </div>
            <button
              type="button"
              onClick={showDelayedOrder}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              View Order <ChevronRight size={15} />
            </button>
          </div>
        ) : (
          <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-900">No delayed new orders</p>
              <p className="text-xs text-emerald-700">Your current order queue is within 15 minutes.</p>
            </div>
          </div>
        )}

        <InfoStat
          icon={<Clock3 size={17} />}
          label="Avg Preparing Time"
          value={averagePreparingMinutes === null ? "—" : `${averagePreparingMinutes} min`}
          helper={averagePreparingMinutes === null ? "No active prep" : "Current prep queue age"}
        />

        <InfoStat
          icon={<span className={`h-2.5 w-2.5 rounded-full ${realtimeConnected ? "bg-emerald-500" : "bg-amber-500"}`} />}
          label="Receiving orders"
          value={realtimeConnected ? "Live" : "Connecting"}
          helper={`Updated ${formatRecentTime(lastUpdatedAt)}`}
          valueClass={realtimeConnected ? "text-emerald-700" : "text-amber-700"}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1 xl:max-w-[390px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders, customer name, or #ID..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-x-auto">
            <FilterTab active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`All (${counts.live})`} />
            <FilterTab active={statusFilter === "new"} onClick={() => setStatusFilter("new")} label={`New (${counts.new})`} />
            <FilterTab active={statusFilter === "preparing"} onClick={() => setStatusFilter("preparing")} label={`Preparing (${counts.preparing})`} />
            <FilterTab active={statusFilter === "ready"} onClick={() => setStatusFilter("ready")} label={`Ready (${counts.ready})`} />
            <FilterTab active={statusFilter === "completed"} onClick={() => setStatusFilter("completed")} label={`Completed (${counts.completed})`} />
            <FilterTab active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")} label={`Cancelled (${counts.cancelled})`} />
          </div>

          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Sort orders</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50"
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="highest">Total: Highest</option>
                <option value="lowest">Total: Lowest</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </label>

            <details className="group relative">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Filter size={15} /> Filters
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Order source</label>
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                >
                  <option value="all">All sources</option>
                  <option value="online">Public Store</option>
                  <option value="qr">Table QR</option>
                </select>

                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fulfillment</label>
                <select
                  value={fulfillmentFilter}
                  onChange={(event) => setFulfillmentFilter(event.target.value as FulfillmentFilter)}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                >
                  <option value="all">All methods</option>
                  <option value="pickup">Pickup Store</option>
                  <option value="delivery">Delivery</option>
                  <option value="dine_in">Dine-in</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setSourceFilter("all");
                    setFulfillmentFilter("all");
                  }}
                  className="mt-4 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Clear filters
                </button>
              </div>
            </details>

            <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`flex w-10 items-center justify-center transition ${viewMode === "split" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                title="Order list with details"
              >
                <List size={17} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex w-10 items-center justify-center border-l border-slate-200 transition ${viewMode === "grid" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                title="Card view"
              >
                <Grid2X2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {filteredOrders.length === 0 ? (
        <EmptyState statusFilter={statusFilter} />
      ) : viewMode === "grid" ? (
        <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <QueueOrderCard
              key={order.id}
              order={order}
              currency={currency}
              busy={pending && pendingOrderId === order.id}
              selected={order.id === selectedOrder?.id}
              onSelect={() => {
                setSelectedOrderId(order.id);
                setViewMode("split");
              }}
              onChange={changeStatus}
              canUpdate={canUpdate}
            />
          ))}
        </section>
      ) : (
        <section className="grid min-h-[570px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[minmax(470px,1.06fr)_minmax(520px,0.94fr)]">
          <div className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold text-slate-950">{queueTitle(statusFilter)}</h2>
                {statusFilter === "all" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${realtimeConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
                    Real-time updates
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-slate-400">{filteredOrders.length} shown</span>
            </div>

            <div className="max-h-[690px] space-y-2 overflow-y-auto p-2.5">
              {filteredOrders.map((order) => (
                <OrderListItem
                  key={order.id}
                  order={order}
                  currency={currency}
                  selected={order.id === selectedOrder?.id}
                  busy={pending && pendingOrderId === order.id}
                  onSelect={() => setSelectedOrderId(order.id)}
                  onChange={changeStatus}
                  canUpdate={canUpdate}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 bg-slate-50/50">
            {selectedOrder ? (
              <OrderDetails
                order={selectedOrder}
                currency={currency}
                busy={pending && pendingOrderId === selectedOrder.id}
                orders={filteredOrders}
                onSelect={setSelectedOrderId}
                onChange={changeStatus}
                onPaymentChange={changePaymentStatus}
                canUpdate={canUpdate}
                canCancel={canCancel}
              />
            ) : (
              <div className="flex h-full min-h-[570px] items-center justify-center p-8 text-center text-slate-500">
                Select an order to view details.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
  sublabel,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left shadow-sm hover:bg-slate-50"
    >
      {icon}
      <span className={`relative h-5 w-9 rounded-full transition ${active ? "bg-blue-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${active ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block text-xs font-semibold leading-3 text-slate-700">{label}</span>
        {sublabel && <span className="mt-0.5 block text-[10px] leading-3 text-slate-400">{sublabel}</span>}
      </span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  icon,
  iconClass,
  helper,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  iconClass: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-[26px] font-bold leading-none text-slate-950">{value}</p>
          <p className="mt-2 truncate text-[11px] font-medium text-slate-400">{helper}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function InfoStat({
  icon,
  label,
  value,
  helper,
  valueClass = "text-slate-950",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <p className={`truncate text-base font-bold ${valueClass}`}>{value}</p>
        <p className="truncate text-[10px] text-slate-400">{helper}</p>
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition ${
        active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function OrderListItem({
  order,
  currency,
  selected,
  busy,
  onSelect,
  onChange,
  canUpdate,
}: {
  order: OnlineOrder;
  currency: string;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onChange: (
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "completed" | "rejected",
  ) => void;
  canUpdate: boolean;
}) {
  const status = order.online_status ?? "new";
  const primary = primaryAction(status);

  return (
    <article
      className={`cursor-pointer rounded-xl border p-3 transition ${
        selected
          ? "border-blue-500 bg-blue-50/50 shadow-[0_0_0_1px_rgba(37,99,235,0.08)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
      onClick={onSelect}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-slate-950">{order.order_number}</h3>
            <StatusBadge status={status} compact />
            {minutesSince(order.created_at) >= 15 && ["new", "accepted"].includes(status) && (
              <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                {minutesSince(order.created_at)} min
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-slate-700">{order.guest_name ?? "Guest customer"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {formatAge(order.created_at)}</span>
            <span>{order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0)} items</span>
            <SourceBadge source={order.order_source} />
            <FulfillmentBadge order={order} />
            <PaymentMiniBadge status={order.payment_status} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 lg:block lg:text-right">
          <p className="text-base font-bold text-slate-950">{formatMoney(order.total, currency)}</p>
          {order.customer_note && (
            <p className="mt-1 hidden truncate text-[10px] italic text-slate-500 lg:block" title={order.customer_note}>
              “{order.customer_note}”
            </p>
          )}
          <div className="mt-2 flex justify-end gap-1.5">
            {busy ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-500">
                <Loader2 size={13} className="animate-spin" /> Updating
              </span>
            ) : primary && canUpdate ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(order.id, primary.status);
                }}
                className={`h-8 rounded-lg px-3 text-xs font-semibold ${primary.className}`}
              >
                {primary.label}
              </button>
            ) : (
              <span className="inline-flex h-8 items-center rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-500">
                {displayStatus(status)}
              </span>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              title="View order details"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function QueueOrderCard({
  order,
  currency,
  busy,
  selected,
  onSelect,
  onChange,
  canUpdate,
}: {
  order: OnlineOrder;
  currency: string;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "completed" | "rejected",
  ) => void;
  canUpdate: boolean;
}) {
  const status = order.online_status ?? "new";
  const primary = primaryAction(status);
  return (
    <article className={`rounded-xl border bg-white p-4 shadow-sm ${selected ? "border-blue-500" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-950">{order.order_number}</h3>
            <StatusBadge status={status} compact />
          </div>
          <p className="mt-1 text-sm font-medium text-slate-700">{order.guest_name ?? "Guest customer"}</p>
        </div>
        <p className="font-bold text-slate-950">{formatMoney(order.total, currency)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SourceBadge source={order.order_source} />
        <FulfillmentBadge order={order} />
        <PaymentMiniBadge status={order.payment_status} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0)} items · {formatAge(order.created_at)}
      </p>
      {order.customer_note && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs italic text-amber-900">“{order.customer_note}”</div>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={onSelect} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          View details
        </button>
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Loader2 size={13} className="animate-spin" /> Updating</span>
        ) : primary && canUpdate ? (
          <button type="button" onClick={() => onChange(order.id, primary.status)} className={`ml-auto rounded-lg px-3 py-2 text-xs font-semibold ${primary.className}`}>
            {primary.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function OrderDetails({
  order,
  currency,
  busy,
  orders,
  onSelect,
  onChange,
  onPaymentChange,
  canUpdate,
  canCancel,
}: {
  order: OnlineOrder;
  currency: string;
  busy: boolean;
  orders: OnlineOrder[];
  onSelect: (id: string) => void;
  onChange: (
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "completed" | "rejected",
  ) => void;
  onPaymentChange: (
    orderId: string,
    status: "pending_verification" | "paid" | "unpaid",
  ) => void;
  canUpdate: boolean;
  canCancel: boolean;
}) {
  const status = order.online_status ?? "new";
  const index = orders.findIndex((item) => item.id === order.id);
  const previous = index > 0 ? orders[index - 1] : null;
  const next = index >= 0 && index < orders.length - 1 ? orders[index + 1] : null;
  const primary = primaryAction(status);

  return (
    <div className="flex h-full min-h-[570px] flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-bold text-slate-950">Order {order.order_number}</h2>
              <StatusBadge status={status} compact />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Placed {formatFullDate(order.created_at)} · {formatAge(order.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={!previous} onClick={() => previous && onSelect(previous.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 enabled:hover:bg-slate-50 disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <button type="button" disabled={!next} onClick={() => next && onSelect(next.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 enabled:hover:bg-slate-50 disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
            <Link href={`/dashboard/orders/${order.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Open full order">
              <ExternalLink size={15} />
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Store size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{order.guest_name ?? "Guest customer"}</p>
                <p className="mt-0.5 text-xs text-slate-500">{order.guest_phone ?? "No phone number"}</p>
                {order.guest_address && <p className="mt-0.5 truncate text-xs text-slate-500">{order.guest_address}</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-3">
          <DetailTile
            icon={order.fulfillment_type === "delivery" ? <Truck size={18} /> : order.fulfillment_type === "dine_in" ? <Utensils size={18} /> : <ShoppingBag size={18} />}
            title={formatFulfillment(order)}
            lines={[
              order.delivery_zone_name ?? null,
              order.guest_address ?? null,
              order.requested_for ? `Requested ${formatFullDate(order.requested_for)}` : null,
            ]}
          />
          <DetailTile
            icon={<Store size={18} />}
            title={order.order_source === "qr" ? "Table QR" : "Public Store"}
            lines={[order.order_source === "qr" ? order.table_name ?? "QR order" : "Online order", order.order_source === "qr" ? "Dine-in channel" : "Website"]}
          />
          <DetailTile
            icon={<CircleDollarSign size={18} />}
            title={order.payment_status === "paid" ? "Paid" : formatPaymentStatus(order.payment_status)}
            lines={[formatPaymentMethod(order.payment_method), order.payment_reference?.startsWith("proof:") ? "Payment proof uploaded" : order.payment_reference ? `Ref: ${order.payment_reference}` : null]}
            accent={order.payment_status === "paid" ? "emerald" : "blue"}
          />
        </section>

        {order.payment_reference?.startsWith("proof:") && <a href={`/api/online-orders/${order.id}/proof`} target="_blank" rel="noreferrer" className="block rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-700">View payment proof</a>}
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-950">Order Items ({order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0)})</h3>
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                  {item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full rounded-lg object-contain" /> : <ShoppingBag size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.quantity} × {item.product_name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {[item.variant_label, ...(Array.isArray(item.selected_options) ? item.selected_options.map((option) => option.name).filter(Boolean) : [])].filter(Boolean).join(" · ") || "Standard item"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-800">{formatMoney(Number(item.unit_price) * Number(item.quantity), currency)}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
            <MoneyRow label="Subtotal" value={formatMoney(order.subtotal, currency)} />
            {Number(order.discount) > 0 && <MoneyRow label={order.coupon_code ? `Discount (${order.coupon_code})` : "Discount"} value={`-${formatMoney(order.discount, currency)}`} />}
            {Number(order.delivery_fee) > 0 && <MoneyRow label="Delivery Fee" value={formatMoney(order.delivery_fee, currency)} />}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-950">
              <span>Total</span>
              <span>{formatMoney(order.total, currency)}</span>
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.05fr]">
          <div className="space-y-3">
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800">Customer Note</p>
              <p className="mt-1 text-xs italic leading-5 text-amber-900">{order.customer_note ? `“${order.customer_note}”` : "No customer note for this order."}</p>
            </section>

            {canUpdate && order.payment_method === "khqr" && order.payment_status !== "paid" && (
              <section className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-bold text-blue-800">KHQR verification</p>
                <p className="mt-1 text-xs text-blue-700">Confirm the payment before completing the order.</p>
                <button type="button" disabled={busy} onClick={() => onPaymentChange(order.id, "paid")} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <Check size={14} /> Mark Paid
                </button>
              </section>
            )}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="text-xs font-bold text-slate-800">Order Activity</h3>
            <div className="mt-3 space-y-3">
              <ActivityItem active title="Order placed" detail={order.order_source === "qr" ? "Customer submitted via table QR" : "Customer submitted via public store"} time={formatClockTime(order.created_at)} />
              {order.payment_status === "paid" && <ActivityItem title="Payment confirmed" detail={formatPaymentMethod(order.payment_method)} />}
              {status !== "new" && <ActivityItem title={displayStatus(status)} detail={activityDetail(status)} />}
            </div>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3">
        <OrderPrintMenu orderId={order.id} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"/>
        <Link href={`/dashboard/orders/${order.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <ExternalLink size={14} /> Full Order
        </Link>

        {canUpdate && busy ? (
          <span className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-500"><Loader2 size={14} className="animate-spin" /> Updating...</span>
        ) : canUpdate && primary ? (
          <>
            {canCancel && !["completed", "rejected"].includes(status) && status !== "ready" && (
              <button type="button" onClick={() => onChange(order.id, "rejected")} className="ml-auto h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50">Cancel Order</button>
            )}
            <button type="button" onClick={() => onChange(order.id, primary.status)} className={`${status === "ready" || status === "new" ? "ml-auto" : ""} inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold ${primary.className}`}>
              <Check size={14} /> {primary.label}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetailTile({
  icon,
  title,
  lines,
  accent = "blue",
}: {
  icon: ReactNode;
  title: string;
  lines: Array<string | null>;
  accent?: "blue" | "emerald";
}) {
  const iconClass = accent === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">{title}</p>
          {lines.filter(Boolean).map((line, index) => (
            <p key={`${line}-${index}`} className="mt-0.5 truncate text-[10px] text-slate-500" title={line ?? undefined}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1.5 flex items-center justify-between text-slate-500">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

function ActivityItem({ active = false, title, detail, time }: { active?: boolean; title: string; detail: string; time?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-blue-600" : "bg-slate-300"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-800">{title}</p>
          {time && <span className="text-[10px] text-slate-400">{time}</span>}
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function EmptyState({ statusFilter }: { statusFilter: QueueFilter }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center shadow-sm">
      <div>
        <ShoppingBag size={44} strokeWidth={1.7} className="mx-auto text-slate-300" />
        <h2 className="mt-4 text-lg font-bold text-slate-950">
          {statusFilter === "all" ? "No live online orders" : `No ${statusFilter} orders`}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          {statusFilter === "all"
            ? "New public-store and table-QR orders will appear here automatically."
            : "Try another status or clear your search and filters."}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const normalized = queueStatus(status);
  const styles: Record<string, string> = {
    new: "bg-blue-50 text-blue-700",
    accepted: "bg-cyan-50 text-cyan-700",
    preparing: "bg-amber-50 text-amber-700",
    ready: "bg-emerald-50 text-emerald-700",
    completed: "bg-violet-50 text-violet-700",
    cancelled: "bg-rose-50 text-rose-700",
  };
  const styleKey = status === "accepted" ? "accepted" : normalized;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} ${styles[styleKey] ?? "bg-slate-100 text-slate-700"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {displayStatus(status)}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${source === "qr" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>
      {source === "qr" ? <Grid2X2 size={11} /> : <Store size={11} />}
      {source === "qr" ? "Table QR" : "Public Store"}
    </span>
  );
}

function FulfillmentBadge({ order }: { order: OnlineOrder }) {
  const type = order.fulfillment_type ?? "pickup";
  const config = type === "delivery"
    ? { icon: <Truck size={11} />, label: "Delivery", cls: "bg-slate-100 text-slate-700" }
    : type === "dine_in"
      ? { icon: <Utensils size={11} />, label: order.table_name ? `Dine-in · ${order.table_name}` : "Dine-in", cls: "bg-indigo-50 text-indigo-700" }
      : { icon: <ShoppingBag size={11} />, label: "Pickup Store", cls: "bg-amber-50 text-amber-700" };
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${config.cls}`}>{config.icon}{config.label}</span>;
}

function PaymentMiniBadge({ status }: { status: string }) {
  const paid = status === "paid";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${paid ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      <CircleDollarSign size={11} /> {paid ? "Paid" : formatPaymentStatus(status)}
    </span>
  );
}

function primaryAction(status: string): {
  status: "accepted" | "preparing" | "ready" | "completed";
  label: string;
  className: string;
} | null {
  if (status === "new") return { status: "accepted", label: "Accept", className: "bg-blue-600 text-white hover:bg-blue-700" };
  if (status === "accepted") return { status: "preparing", label: "Start Preparing", className: "bg-amber-500 text-white hover:bg-amber-600" };
  if (status === "preparing") return { status: "ready", label: "Mark Ready", className: "border border-blue-300 bg-white text-blue-700 hover:bg-blue-50" };
  if (status === "ready") return { status: "completed", label: "Complete Order", className: "bg-blue-600 text-white hover:bg-blue-700" };
  return null;
}

function isActive(order: OnlineOrder) {
  return ACTIVE_STATUSES.has(order.online_status ?? "new");
}

function queueStatus(status: string | null): QueueFilter {
  const value = status ?? "new";
  if (value === "accepted") return "new";
  if (value === "rejected") return "cancelled";
  if (value === "preparing" || value === "ready" || value === "completed") return value;
  return "new";
}

function displayStatus(status: string | null) {
  const value = status ?? "new";
  if (value === "rejected") return "Cancelled";
  if (value === "accepted") return "Accepted";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function queueTitle(filter: QueueFilter) {
  if (filter === "all") return "Live Orders";
  if (filter === "cancelled") return "Cancelled Orders";
  return `${filter.charAt(0).toUpperCase()}${filter.slice(1)} Orders`;
}

function formatPaymentMethod(value: string) {
  if (value === "khqr") return "KHQR";
  if (value === "cash") return "Cash";
  if (value === "pay_later") return "Pay Later / Cash";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPaymentStatus(value: string) {
  if (value === "pending_verification") return "Pending verification";
  if (value === "paid") return "Paid";
  if (value === "unpaid") return "Unpaid";
  if (value === "refunded") return "Refunded";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "KHR" ? 0 : 2,
      maximumFractionDigits: currency === "KHR" ? 0 : 2,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function formatFulfillment(order: OnlineOrder) {
  if (order.fulfillment_type === "dine_in") {
    return order.table_name ? `Dine-in · ${order.table_name}` : "Dine-in";
  }
  if (order.fulfillment_type === "delivery") return "Delivery";
  return "Pickup Store";
}

function activityDetail(status: string) {
  if (status === "accepted") return "Order accepted by the shop";
  if (status === "preparing") return "Order is being prepared";
  if (status === "ready") return "Order is ready for customer fulfillment";
  if (status === "completed") return "Order workflow completed";
  if (status === "rejected") return "Order was cancelled by the shop";
  return "Current order status";
}

function minutesSince(dateValue: string) {
  const diff = Date.now() - new Date(dateValue).getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.floor(diff / 60000));
}

function formatAge(dateValue: string) {
  const minutes = minutesSince(dateValue);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatFullDate(dateValue: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateValue));
  } catch {
    return dateValue;
  }
}

function formatClockTime(dateValue: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(dateValue));
  } catch {
    return "";
  }
}

function formatRecentTime(value: Date) {
  const seconds = Math.floor((Date.now() - value.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ago`;
}

function isToday(dateValue: string) {
  const date = new Date(dateValue);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
