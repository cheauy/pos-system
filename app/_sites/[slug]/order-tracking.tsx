"use client";
import { useRef, useState } from "react";
import { PackageSearch, X } from "lucide-react";
import { recentOrders, trackingToken, type SavedOrder } from "@/lib/storefront/order-tracking";
import { useStorefrontLanguage } from "./storefront-language";
export default function OrderTracking({ slug }: { slug: string }) {
  const dialog = useRef<HTMLDialogElement>(null); const { t } = useStorefrontLanguage();
  const [orders, setOrders] = useState<SavedOrder[]>([]); const [value, setValue] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function track() {
    const token = trackingToken(value);
    if (token) { window.location.assign(`/order/${token}`); return; }
    if (!/^WEB-[0-9A-F]{10}$/i.test(value.trim())) { setError("Enter a valid tracking ID or link."); return; }
    setBusy(true); setError("");
    try { const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: value.trim().toUpperCase() }) }); const result = await response.json(); if (!response.ok || !result.token) throw new Error("Order not found. Check your tracking ID and try again."); window.location.assign(`/order/${result.token}`); } catch { setError("Order not found. Check your tracking ID and try again."); } finally { setBusy(false); }
  }
  return <><button type="button" className="inline-flex items-center gap-2" onClick={() => { setOrders(recentOrders(slug)); dialog.current?.showModal(); }}><PackageSearch size={16} />{t("Track My Order")}</button>
    <dialog ref={dialog} className="store-tracking-dialog" aria-label={t("Track My Order")}>
      <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">{t("Track My Order")}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label={t("Close")}><X /></button></div>
      <p className="my-3 text-sm text-slate-500">{t("Recent orders are saved on this device. Keep your tracking link to use another device.")}</p>
      {orders.map(order => <a key={order.token} href={`/order/${order.token}`}>{order.number} →</a>)}
      {!orders.length && <p className="my-4 text-sm">{t("No saved orders on this device yet.")}</p>}
      <form onSubmit={e => { e.preventDefault(); if (!busy) void track(); }}><label className="mt-4 block text-sm">{t("Tracking ID or link")}<input placeholder="WEB-555E962F02" value={value} onChange={e => { setValue(e.target.value); setError(""); }} required /></label>{error && <p role="alert" className="mb-3 text-sm text-red-600">{t(error)}</p>}<button className="track-submit" disabled={busy} type="submit">{t("Track My Order")}</button></form>
    </dialog></>;
}
