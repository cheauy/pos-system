'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/app/(dashboard)/dashboard/pos/pos-workspace-components';
import { changeOrderWorkspaceStatus } from '@/app/(dashboard)/dashboard/orders/order-workspace-actions';

export default function ScannedOrderComplete({ id, number, businessId, updatedAt }: { id: string; number: string; businessId: string; updatedAt: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  async function complete() {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await changeOrderWorkspaceStatus(id, updatedAt, 'completed', '', businessId);
      if (!result.success) { setError(result.message); return; }
      setDone(true); setConfirm(false); toast.success('Order completed'); router.refresh();
    } catch { setError('Unable to confirm the result. Refresh this order before trying again.'); }
    finally { working.current = false; setBusy(false); }
  }
  if (done) return null;
  return <><button type="button" onClick={() => { setError(''); setConfirm(true); }} className="fixed right-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-700 print:hidden" style={{bottom:'calc(20px + env(safe-area-inset-bottom))'}}><CheckCircle2 size={20}/>Complete</button>
    {confirm && <Modal title="Complete order?" locked={busy} onClose={() => setConfirm(false)}><p>Mark {number} as completed? This does not collect or change payment.</p>{error && <p role="alert" className="mt-3 text-red-600">{error}</p>}<button type="button" disabled={busy} onClick={() => void complete()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={18}/> : <CheckCircle2 size={18}/>}Complete</button></Modal>}
  </>;
}
