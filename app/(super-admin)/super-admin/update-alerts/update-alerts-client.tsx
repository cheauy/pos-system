'use client';

import { useRef, useState } from 'react';
import { Bell, Loader2, Megaphone, RefreshCw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { UpdateAlertCard } from '@/components/update-alert-banner';
import { alertKinds, validateAlert, type AlertHistory, type UpdateAlert } from '@/lib/update-alerts';
import { endAlert, loadAlertHistory, publishAlert } from './actions';

const field = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const empty = { kind: 'update' as UpdateAlert['kind'], title: '', message: '', buttonLabel: '', buttonLink: '' };
function dateLabel(value: string) {
  // Explicit locale and zone keep the server and browser render identical.
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Phnom_Penh' }).format(new Date(value));
}

export default function UpdateAlertsClient({ initialAlerts, initialError }: { initialAlerts: AlertHistory[]; initialError: string | null }) {
  const [form, setForm] = useState(empty);
  const [autoEnd, setAutoEnd] = useState(false);
  const [endTime, setEndTime] = useState('');
  const [alerts, setAlerts] = useState(initialAlerts);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [live, setLive] = useState(initialAlerts.some(alert => alert.is_live));
  const request = useRef<{ id: string; payload: string } | null>(null);
  const running = useRef(false);

  async function refresh(nextOffset = offset) {
    const result = await loadAlertHistory(nextOffset);
    if (result.error) { setError(result.error); return; }
    setAlerts(result.alerts); setOffset(nextOffset); setError(null);
    if (nextOffset === 0) setLive(result.alerts.some(alert => alert.is_live));
  }
  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { await operation(); }
    catch { setError('Unable to connect. Please try again.'); }
    finally { running.current = false; setBusy(false); }
  }
  async function publish() {
    await run(async () => {
      if (autoEnd && (!endTime || !Number.isFinite(new Date(endTime).getTime()))) { setError('Choose when the alert should end.'); return; }
      const input = { ...form, expiresAt: autoEnd ? new Date(endTime).toISOString() : null };
      const invalid = validateAlert(input);
      if (invalid) { setError(invalid); return; }
      const payload = JSON.stringify(input);
      if (request.current?.payload !== payload) request.current = { id: crypto.randomUUID(), payload };
      const result = await publishAlert(request.current.id, input);
      if (result.error) { setError(result.error); return; }
      toast.success('Update alert published to every user.');
      setForm(empty); setAutoEnd(false); setEndTime(''); request.current = null;
      await refresh(0);
    });
  }
  const preview: UpdateAlert = {
    id: 'preview', kind: form.kind, title: form.title || 'Your update title', message: form.message || 'Your message appears here.',
    button_label: form.buttonLabel || null,
    button_link: /^\/dashboard([/?#][A-Za-z0-9_/?#=&.~-]*)?$/.test(form.buttonLink) ? form.buttonLink : null,
    expires_at: null,
  };

  return <div className="w-full space-y-5 text-slate-900">
    <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-700"><Megaphone size={16} /> User Update Alerts</p><p className="mt-1 text-sm text-slate-500">Notify users about TENH updates.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><h1 className="text-2xl font-bold">Publish an update alert</h1><span className={`rounded-full px-3 py-1 text-xs font-medium ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{live ? 'An alert is live' : 'No alert is live right now'}</span></div>
    <form onSubmit={event => { event.preventDefault(); void publish(); }} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <fieldset><legend className="mb-2 text-sm font-semibold">Type</legend><div className="flex flex-wrap gap-2">{Object.entries(alertKinds).map(([key, kind]) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${form.kind === key ? kind.style : 'border-slate-200 bg-white text-slate-700'}`}><input type="radio" name="kind" value={key} checked={form.kind === key} onChange={() => setForm({ ...form, kind: key as UpdateAlert['kind'] })} className="sr-only peer" /><span className={`h-2 w-2 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 ${kind.dot}`} />{kind.label}</label>)}</div></fieldset>
        <label className="block text-sm font-semibold"><span className="flex justify-between">Title <span className="text-xs font-normal text-slate-400">{form.title.length} / 120</span></span><input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="New improvements are live" className={field} /></label>
        <label className="block text-sm font-semibold"><span className="flex justify-between">Message <span className="text-xs font-normal text-slate-400">{form.message.length} / 1500</span></span><textarea required maxLength={1500} rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="What changed, and what should users do about it?" className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Keep it concise so users can understand the update quickly.</span></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Button label <span className="font-normal text-slate-400">optional</span><input maxLength={40} value={form.buttonLabel} onChange={e => setForm({ ...form, buttonLabel: e.target.value })} placeholder="View update" className={field} /></label><label className="text-sm font-semibold">Button link <span className="font-normal text-slate-400">optional</span><input maxLength={500} value={form.buttonLink} onChange={e => setForm({ ...form, buttonLink: e.target.value })} placeholder="/dashboard" className={field} /></label></div>
        <div className="border-t border-slate-200 pt-4"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={autoEnd} onChange={e => setAutoEnd(e.target.checked)} role="switch" className="h-5 w-5 accent-blue-600" /><span><span className="block text-sm font-semibold">End automatically</span><span className="block text-xs text-slate-500">Otherwise it stays live until you end or replace it.</span></span></label>{autoEnd && <label className="mt-3 block max-w-sm text-sm">End date and time <span className="text-xs text-slate-500">(your local time)</span><input required type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className={field} /></label>}</div>
      </fieldset>
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">How users will see it</p><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs font-bold">TENH <Bell size={15} className="text-slate-400" /></div><div className="space-y-3 p-4"><div className="relative"><UpdateAlertCard alert={preview} preview /><X size={14} aria-hidden className="absolute right-3 top-3 text-slate-400" /></div><div className="h-1.5 w-1/2 rounded bg-slate-100" /><div className="h-1.5 w-3/4 rounded bg-slate-100" /></div></div></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"><div><p className="text-sm font-semibold">Goes to every TENH user</p><p className="text-xs text-slate-500">Users can dismiss this alert individually.</p>{live && <p className="mt-1 text-xs text-amber-700">Publishing replaces the current live alert.</p>}</div><button disabled={busy || !form.title.trim() || !form.message.trim()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Publish alert</button></div>
    </form>
    <section className="space-y-3 pb-6"><div className="flex items-center justify-between"><h2 className="font-bold">Alert history</h2><button className={button} disabled={busy} onClick={() => void run(() => refresh(0))}><RefreshCw size={14} />Refresh</button></div>
      {!alerts.length ? <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">{error ? 'Alert history is unavailable.' : 'Your first alert will appear here with the option to end it early.'}</div> : <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{alerts.map(alert => <article key={alert.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${alertKinds[alert.kind].dot}`} /><span className="text-xs text-slate-500">{alertKinds[alert.kind].label}</span><span className={`rounded-full px-2 py-0.5 text-xs ${alert.is_live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{alert.is_live ? 'Live' : alert.ended_at ? 'Ended' : 'Expired'}</span></div><h3 className="mt-1 break-words font-semibold">{alert.title}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{alert.message}</p><p className="mt-2 text-xs text-slate-400">Published {dateLabel(alert.created_at)} · Cambodia time{alert.expires_at ? ` · Ends ${dateLabel(alert.expires_at)}` : ''}</p></div>{alert.is_live && <button disabled={busy} className={button} onClick={() => void run(async () => { const result = await endAlert(alert.id); if (result.error) { setError(result.error); return; } toast.success('Alert ended.'); await refresh(0); })}><X size={14} />End alert</button>}</article>)}</div>}
      {(offset > 0 || alerts.length === 20) && <div className="flex justify-end gap-2"><button disabled={busy || offset === 0} className={button} onClick={() => void run(() => refresh(offset - 20))}>Previous</button><button disabled={busy || alerts.length < 20} className={button} onClick={() => void run(() => refresh(offset + 20))}>Next</button></div>}
    </section>
  </div>;
}
