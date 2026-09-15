"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  ChefHat,
  Clock3,
  Eye,
  Loader2,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  ShoppingBag,
  Store,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { updateOnlineOrderStatus } from "./actions";

type OrderItem = {
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
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  order_items: OrderItem[];
};

export default function OnlineOrdersClient({
  businessId,
  initialOrders,
}: {
  businessId: string;
  initialOrders: OnlineOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const newestOrderRef = useRef(initialOrders[0]?.id ?? null);

  const counts = useMemo(() => {
    return initialOrders.reduce(
      (acc, order) => {
        const status = order.online_status ?? "new";
        if (status in acc) {
          acc[status as keyof typeof acc] += 1;
        }
        return acc;
      },
      { new: 0, preparing: 0, ready: 0 },
    );
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
          const row = payload.new as Record<string, unknown>;
          if (
            payload.eventType === "INSERT" &&
            (row.order_source === "online" || row.order_source === "qr")
          ) {
            notifyNewOrder();
          }
          router.refresh();
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      router.refresh();
    }, 10000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [businessId, router, alertsEnabled]);

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
    if (!alertsEnabled) return;
    beep();
    toast.success("New online order received");

    if (Notification.permission === "granted") {
      new Notification("TENH POS - New online order", {
        body: "Open Online Orders to review the new customer order.",
      });
    }
  }

  async function enableAlerts() {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    setAlertsEnabled(true);
    beep();
    toast.success("Online order alerts enabled");
  }

  function changeStatus(
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "completed" | "rejected",
  ) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Online Orders</h1>
          <p className="mt-1 text-slate-500">
            Live customer orders from your public store and table QR codes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enableAlerts}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              alertsEnabled
                ? "bg-emerald-50 text-emerald-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <Bell size={17} />
            {alertsEnabled ? "Alerts On" : "Enable Alerts"}
          </button>

          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={17} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="New" value={counts.new} icon={<Clock3 size={20} />} />
        <Summary label="Preparing" value={counts.preparing} icon={<ChefHat size={20} />} />
        <Summary label="Ready" value={counts.ready} icon={<PackageCheck size={20} />} />
      </div>

      {initialOrders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ShoppingBag size={42} className="mx-auto text-slate-300" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">No online orders yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            New public-store and table-QR orders will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {initialOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={pending && pendingOrderId === order.id}
              onChange={changeStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600">{icon}</div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onChange,
}: {
  order: OnlineOrder;
  busy: boolean;
  onChange: (
    orderId: string,
    status: "accepted" | "preparing" | "ready" | "completed" | "rejected",
  ) => void;
}) {
  const status = order.online_status ?? "new";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{order.order_number}</h2>
            <StatusBadge status={status} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">
              {order.order_source === "qr" ? "QR" : "Online"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(order.created_at).toLocaleString()}
          </p>
        </div>

        <p className="text-xl font-bold text-slate-950">${Number(order.total).toFixed(2)}</p>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Info icon={<Store size={16} />} label="Customer" value={order.guest_name ?? "Guest"} />
          <Info icon={<Phone size={16} />} label="Phone" value={order.guest_phone ?? "—"} />
          <Info
            icon={order.fulfillment_type === "dine_in" ? <Utensils size={16} /> : <MapPin size={16} />}
            label="Fulfillment"
            value={formatFulfillment(order)}
          />
          {order.guest_address && (
            <Info icon={<MapPin size={16} />} label="Address" value={order.guest_address} />
          )}
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</p>
          <div className="mt-3 space-y-3">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.quantity} × {item.product_name}
                  </p>
                  {item.variant_label && (
                    <p className="text-xs text-slate-500">{item.variant_label}</p>
                  )}
                  {Array.isArray(item.selected_options) && item.selected_options.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {item.selected_options.map((option) => option.name).filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <span className="font-semibold text-slate-700">
                  ${(Number(item.unit_price) * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {order.customer_note && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">Customer note:</span> {order.customer_note}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {busy && (
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
              <Loader2 size={16} className="animate-spin" /> Updating...
            </span>
          )}

          {!busy && status === "new" && (
            <>
              <Action onClick={() => onChange(order.id, "accepted")} label="Accept" icon={<Check size={16} />} className="bg-emerald-600 text-white hover:bg-emerald-700" />
              <Action onClick={() => onChange(order.id, "rejected")} label="Reject" icon={<X size={16} />} className="bg-red-50 text-red-700 hover:bg-red-100" />
            </>
          )}

          {!busy && status === "accepted" && (
            <Action onClick={() => onChange(order.id, "preparing")} label="Start Preparing" icon={<ChefHat size={16} />} className="bg-amber-500 text-white hover:bg-amber-600" />
          )}

          {!busy && status === "preparing" && (
            <Action onClick={() => onChange(order.id, "ready")} label="Mark Ready" icon={<PackageCheck size={16} />} className="bg-violet-600 text-white hover:bg-violet-700" />
          )}

          {!busy && status === "ready" && (
            <Action onClick={() => onChange(order.id, "completed")} label="Complete" icon={<Check size={16} />} className="bg-emerald-600 text-white hover:bg-emerald-700" />
          )}

          <Link
            href={`/dashboard/orders/${order.id}`}
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Eye size={16} /> Details
          </Link>
        </div>
      </div>
    </article>
  );
}

function Action({ onClick, label, icon, className }: { onClick: () => void; label: string; icon: React.ReactNode; className: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${className}`}>
      {icon} {label}
    </button>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="break-words font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: "bg-blue-50 text-blue-700",
    accepted: "bg-cyan-50 text-cyan-700",
    preparing: "bg-amber-50 text-amber-700",
    ready: "bg-violet-50 text-violet-700",
    completed: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function formatFulfillment(order: OnlineOrder) {
  if (order.fulfillment_type === "dine_in") {
    return order.table_name ? `Dine In · ${order.table_name}` : "Dine In";
  }
  if (order.fulfillment_type === "delivery") return "Delivery";
  return "Pickup";
}
