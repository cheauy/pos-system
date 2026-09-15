"use client";

import Link from "next/link";
import { Bell, CheckCheck, Settings2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  notification_type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  message: string;
  href: string | null;
  occurred_at: string;
};

type Prefs = { browser_enabled: boolean; sound_enabled: boolean };

const severityClass: Record<NotificationRow["severity"], string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

export default function NotificationBell({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Prefs>({ browser_enabled: false, sound_enabled: true });
  const previousUnread = useRef(0);
  const [supabase] = useState(() => createClient());

  const load = useCallback(async (announce = false) => {
    await supabase.rpc("refresh_business_notifications", { p_business_id: businessId });
    const [{ data: notifications }, { data: reads }, { data: prefData }] = await Promise.all([
      supabase.from("business_notifications").select("id,notification_type,severity,title,message,href,occurred_at").eq("business_id", businessId).eq("is_active", true).order("occurred_at", { ascending: false }).limit(20),
      supabase.from("business_notification_reads").select("notification_id"),
      supabase.from("business_notification_preferences").select("browser_enabled,sound_enabled").eq("business_id", businessId).maybeSingle(),
    ]);
    const rows = (notifications ?? []) as NotificationRow[];
    const read = new Set((reads ?? []).map((r: { notification_id: string }) => r.notification_id));
    const nextPrefs = (prefData ?? prefs) as Prefs;
    setItems(rows);
    setReadIds(read);
    setPrefs(nextPrefs);
    const unread = rows.filter((n) => !read.has(n.id)).length;
    if (announce && unread > previousUnread.current) {
      const newest = rows.find((n) => !read.has(n.id));
      if (nextPrefs.sound_enabled) {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
          osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.16);
        } catch {}
      }
      if (nextPrefs.browser_enabled && newest && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(newest.title, { body: newest.message });
      }
    }
    previousUnread.current = unread;
  }, [businessId, prefs, supabase]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 30000);
    const channel = supabase.channel(`notifications:${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_notifications", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_transfers", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_register_shifts", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_credit_accounts", filter: `business_id=eq.${businessId}` }, () => void load(true))
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [businessId, load, supabase]);

  const unread = items.filter((n) => !readIds.has(n.id)).length;

  async function markRead(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("business_notification_reads").upsert({ notification_id: id, user_id: user.id, read_at: new Date().toISOString() });
    setReadIds((current) => new Set(current).add(id));
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || items.length === 0) return;
    await supabase.from("business_notification_reads").upsert(items.map((n) => ({ notification_id: n.id, user_id: user.id, read_at: new Date().toISOString() })));
    setReadIds(new Set(items.map((n) => n.id)));
  }

  async function toggleSound() {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const next = !prefs.sound_enabled;
    await supabase.from("business_notification_preferences").upsert({ business_id: businessId, user_id: user.id, sound_enabled: next, browser_enabled: prefs.browser_enabled, updated_at: new Date().toISOString() });
    setPrefs((p) => ({ ...p, sound_enabled: next }));
  }

  async function enableBrowser() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    await supabase.from("business_notification_preferences").upsert({ business_id: businessId, user_id: user.id, browser_enabled: true, sound_enabled: prefs.sound_enabled, updated_at: new Date().toISOString() });
    setPrefs((p) => ({ ...p, browser_enabled: true }));
  }

  return <div className="relative">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Notifications" className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <Bell size={20}/>
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 z-50 mt-2 w-[min(26rem,90vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div><p className="font-semibold">Notifications</p><p className="text-xs text-slate-500">{unread} unread</p></div>
        <div className="flex items-center gap-1">
          <button title={prefs.sound_enabled ? "Mute sound" : "Enable sound"} onClick={toggleSound} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">{prefs.sound_enabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>
          {!prefs.browser_enabled && typeof Notification !== "undefined" && <button title="Enable browser notifications" onClick={enableBrowser} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><Settings2 size={17}/></button>}
          <button title="Mark all read" onClick={markAllRead} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><CheckCheck size={17}/></button>
        </div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No active alerts.</p> : items.slice(0, 8).map((n) => {
          const read = readIds.has(n.id);
          return <Link key={n.id} href={n.href ?? "/dashboard/notifications"} onClick={() => { void markRead(n.id); setOpen(false); }} className={`flex gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70 ${read ? "opacity-65" : ""}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityClass[n.severity]}`}/>
            <span className="min-w-0"><span className="block text-sm font-semibold">{n.title}</span><span className="block truncate text-xs text-slate-500">{n.message}</span><span className="mt-1 block text-[11px] text-slate-400">{new Date(n.occurred_at).toLocaleString()}</span></span>
          </Link>;
        })}
      </div>
      <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 text-center text-sm font-semibold text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800">View all notifications</Link>
    </div>}
  </div>;
}
