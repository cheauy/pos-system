'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, ScanLine } from 'lucide-react';
import { Modal } from '@/app/(dashboard)/dashboard/pos/pos-workspace-components';
import { resolveOrderQr } from '@/lib/orders/resolve-order-qr';

export default function OrderQrScanner() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button type="button" aria-label="Scan order QR code" title="Scan order QR code" onClick={() => setOpen(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 xl:hidden"><ScanLine size={20}/></button>
    {open && <ScanDialog close={close}/>}</>;
}

function ScanDialog({ close }: { close: () => void }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let handled = false;
    let controls: { stop: () => void } | undefined;
    const element = video.current;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open the website over HTTPS to use the camera.');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled || !element) return;
        controls = await new BrowserQRCodeReader().decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, element, async (result, _error, camera) => {
          if (!result || handled || cancelled) return;
          handled = true;
          camera.stop();
          setBusy(true);
          try {
            const order = await resolveOrderQr(result.getText());
            if (cancelled) return;
            if ('error' in order) throw new Error(order.error);
            router.push(`/dashboard/orders/${order.id}`);
            close();
          } catch (failure) {
            if (!cancelled) { setError(failure instanceof Error ? failure.message : 'Unable to open this order. Please try again.'); setBusy(false); }
          }
        });
        if (cancelled) controls.stop();
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error && failure.name === 'NotAllowedError' ? 'Camera access was denied. Allow camera access in your browser and try again.' : failure instanceof Error ? failure.message : 'Camera unavailable. Please try again.');
      }
    }
    void start();
    return () => { cancelled = true; controls?.stop(); const stream = element?.srcObject as MediaStream | null; stream?.getTracks().forEach(track => track.stop()); };
  }, [attempt, router, close]);
  return <Modal title="Scan order QR code" onClose={close} locked={busy}>
    <p className="mb-3 text-sm text-slate-500">Scan the QR code on a TENH POS shipping label.</p>
    <video ref={video} muted playsInline className={`${busy || error ? 'hidden' : ''} aspect-square w-full rounded-xl bg-black object-cover`}/>
    {busy && <div role="status" className="flex min-h-48 items-center justify-center gap-3"><LoaderCircle className="animate-spin"/>Loading order details…</div>}
    {error && <div role="alert" className="space-y-4 rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200"><p>{error}</p><button type="button" className="rounded-lg border border-current px-4 py-2" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div>}
  </Modal>;
}
