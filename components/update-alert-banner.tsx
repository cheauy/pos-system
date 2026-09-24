'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { alertKinds, type UpdateAlert } from '@/lib/update-alerts';

export function UpdateAlertCard({ alert, onDismiss, busy = false, preview = false }: {
  alert: UpdateAlert; onDismiss?: () => void; busy?: boolean; preview?: boolean;
}) {
  const kind = alertKinds[alert.kind];
  return <section aria-label="Update alert" className={`relative flex gap-3 rounded-xl border p-4 ${kind.style}`}>
    <Megaphone size={20} className="mt-1 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-wider">{kind.label}</p>
      <h2 className="break-words font-bold">{alert.title}</h2>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{alert.message}</p>
      {alert.button_label && alert.button_link && (preview
        ? <span className="mt-3 inline-flex rounded-lg border border-current px-3 py-1.5 text-sm font-semibold">{alert.button_label}</span>
        : <Link href={alert.button_link} className="mt-3 inline-flex rounded-lg border border-current px-3 py-1.5 text-sm font-semibold hover:underline">{alert.button_label}</Link>)}
    </div>
    {onDismiss && <button type="button" onClick={onDismiss} disabled={busy} aria-label="Dismiss update alert" className="self-start rounded-lg p-1.5 hover:bg-black/5 disabled:opacity-40"><X size={18} /></button>}
  </section>;
}

export default function UpdateAlertBanner() {
  const [alert, setAlert] = useState<UpdateAlert | null>(null);
  const [busy, setBusy] = useState(false);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let inFlight = false;
    let authVersion = 0;
    async function refresh() {
      if (stopped || inFlight || document.hidden) return;
      inFlight = true;
      const version = authVersion;
      try {
        const { data, error } = await supabase.rpc('tenh_live_update_alert');
        if (!stopped && version === authVersion && !error) setAlert(data && !dismissed.current.has(data.id) ? data as UpdateAlert : null);
      } catch { /* Keep the workspace usable during a temporary connection failure. */ }
      finally {
        inFlight = false;
        if (!stopped && version !== authVersion) void refresh();
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      authVersion++;
      dismissed.current.clear();
      setAlert(null);
      // Defer requests outside the auth callback to avoid holding its lock.
      window.setTimeout(() => { void refresh(); }, 0);
    });
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { stopped = true; window.clearInterval(timer); listener.subscription.unsubscribe(); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    if (!alert?.expires_at) return;
    // Check bounded intervals so distant expiries cannot overflow setTimeout.
    const timer = window.setInterval(() => {
      if (Date.parse(alert.expires_at!) <= Date.now()) setAlert(current => current?.id === alert.id ? null : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [alert]);

  async function dismiss() {
    if (!alert || busy) return;
    setBusy(true);
    try {
      const { error } = await createClient().rpc('tenh_dismiss_update_alert', { p_id: alert.id });
      if (error) throw error;
      dismissed.current.add(alert.id);
      setAlert(current => current?.id === alert.id ? null : current);
    } catch { toast.error('Unable to dismiss the alert. Please try again.'); }
    finally { setBusy(false); }
  }
  return alert ? <div className="mb-4 print:hidden" aria-live="polite"><UpdateAlertCard alert={alert} onDismiss={dismiss} busy={busy} /></div> : null;
}
