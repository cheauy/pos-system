import { Bell, CircleAlert, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import NotificationLink from "./notification-link";
import NotificationDate from "./notification-date";
import styles from "./notifications-responsive.module.css";

const iconMap = { info: Info, success: CheckCircle2, warning: TriangleAlert, critical: CircleAlert } as const;
const tone = { info: "text-blue-600 bg-blue-50", success: "text-emerald-600 bg-emerald-50", warning: "text-amber-700 bg-amber-50", critical: "text-red-700 bg-red-50" } as const;
export type NotificationRow = { id: string; notification_type: string; severity: string; title: string; message: string; href: string | null; occurred_at: string; is_active: boolean };

export function notificationDate(value: string, locale?: string) {
  const occurred = new Date(value);
  let date = occurred.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  // Some web runtimes omit Khmer locale data; numeric dates avoid English month fallbacks.
  if (locale === "km-KH" && !/[\u1780-\u17ff]/.test(date)) date = occurred.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  return date;
}

export function groupNotifications(items: NotificationRow[], locale?: string) {
  const groups = new Map<string, NotificationRow[]>();
  for (const item of items) {
    const date = notificationDate(item.occurred_at, locale);
    const group = groups.get(date);
    if (group) group.push(item); else groups.set(date, [item]);
  }
  return [...groups];
}

export default function NotificationsList({ items, read, error }: { items: NotificationRow[]; read: Set<string>; error?: string }) {
  return <main className={`mx-auto max-w-5xl ${styles.page}`}>
    <div className={`mb-7 ${styles.heading}`}><h1 className="flex items-center gap-3 text-3xl font-bold"><Bell />Notification Center</h1><p className="mt-1 text-slate-500">Orders, payments, inventory, credit, transfers and register alerts in one place.</p></div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div> :
      <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${styles.list}`}>
        {items.length === 0 ? <p className="p-10 text-center text-slate-500">No notifications yet.</p> : groupNotifications(items).map(([date, group]) =>
          <section key={date} className={styles.group}>
            <NotificationDate date={date} khmerDate={notificationDate(group[0].occurred_at, "km-KH")} className={styles.date} />
            {group.map(n => {
              const Icon = iconMap[n.severity as keyof typeof iconMap] ?? Info;
              return <NotificationLink key={n.id} id={n.id} href={n.href ?? "#"} className={`flex gap-4 border-b border-slate-100 p-5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${read.has(n.id) ? "opacity-65" : ""} ${styles.row}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone[n.severity as keyof typeof tone] ?? tone.info}`}><Icon size={19} /></span>
                <span className={`min-w-0 flex-1 ${styles.subject}`}>
                  <span className={`flex items-center gap-2 ${styles.title}`}><span className="font-semibold">{n.title}</span>{!read.has(n.id) && <span role="img" aria-label="Unread" className={`h-2 w-2 rounded-full bg-blue-600 ${styles.unread}`} />}{!n.is_active && <span className={`rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500 ${styles.resolved}`}>Resolved</span>}</span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{n.message}</span>
                  <time dateTime={n.occurred_at} className={`mt-1 block text-xs text-slate-400 ${styles.timestamp}`}><span className={styles.fullDate}>{new Date(n.occurred_at).toLocaleString()}</span><span className={styles.time}>{new Date(n.occurred_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></time>
                </span>
              </NotificationLink>;
            })}
          </section>)}</div>}
  </main>;
}
