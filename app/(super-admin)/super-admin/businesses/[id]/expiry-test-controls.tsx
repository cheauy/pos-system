'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, RotateCcw, TimerOff } from 'lucide-react';
import { changeTestExpiry } from './expiry-test-actions';

export default function ExpiryTestControls({ businessId, active, originalExpiry, available }: {
  businessId: string; active: boolean; originalExpiry: string | null; available: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(operation: 'expire' | 'restore') {
    if (busy) return;
    if (operation === 'expire' && !window.confirm('Expire this test business now? Its workspace will be locked until you restore the expiry.')) return;
    setBusy(true); setMessage('');
    try {
      const result = await changeTestExpiry(businessId, operation);
      setMessage(result.message);
      if (result.success) router.refresh();
    } catch { setMessage('Unable to update the test expiry. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
    <div className="flex items-center gap-3"><FlaskConical className="text-amber-700" size={22} aria-hidden="true" /><h2 className="text-lg font-bold text-slate-900">Subscription expiry test</h2><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Test only</span></div>
    <p className="mt-2 text-sm leading-6 text-slate-600">Temporarily expire this business, then restore its original expiry. Users, branches, and payments are not changed.</p>
    {active && <p className="mt-3 text-sm font-medium text-amber-900">Test active · Original expiry: {originalExpiry ? `${new Date(originalExpiry).toISOString().replace('T', ' ').slice(0, 19)} UTC` : 'No expiry'}</p>}
    {!available && <p role="alert" className="mt-3 text-sm text-amber-900">The expiry test migration must be applied before these controls are available.</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={busy || active || !available} onClick={() => run('expire')} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40"><TimerOff size={17} aria-hidden="true" />Expire now (test)</button>
      <button type="button" disabled={busy || !active || !available} onClick={() => run('restore')} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><RotateCcw size={17} aria-hidden="true" />Restore test expiry</button>
    </div>
    <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">{busy ? 'Updating test expiry…' : message}</p>
  </section>;
}
