'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, ScanLine } from 'lucide-react';
import { Modal } from '@/app/(dashboard)/dashboard/pos/pos-workspace-components';
import { resolveOrderQr } from '@/lib/orders/resolve-order-qr';

export default function OrderQrScanner({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button type="button" aria-label="Scan order QR code" title="Scan order QR code" onClick={() => setOpen(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 xl:hidden"><ScanLine size={20}/></button>
    {open && <ScanDialog close={close} onNavigate={onNavigate}/>}</>;
}

function ScanDialog({ close, onNavigate }: { close: () => void; onNavigate?: () => void }) {
  const navigated = useRef(onNavigate);
  useEffect(() => { navigated.current = onNavigate; }, [onNavigate]);
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
            window.dispatchEvent(new Event('tenh:close-navigation'));
            router.push(`/dashboard/orders/${order.id}?scanned=1`);
            close();
            navigated.current?.();
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
    {/* Phones: full-screen dark camera view with Close and caption at the foot, like the mobile app scanner. */}
    <div className="max-sm:fixed max-sm:inset-0 max-sm:z-[60] max-sm:flex max-sm:flex-col max-sm:justify-end max-sm:gap-5 max-sm:bg-[#0f172a] max-sm:p-5 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:text-white">
    <p className="mb-3 text-sm text-slate-500 max-sm:hidden">Scan the QR code on a TENH POS shipping label.</p>
    <video ref={video} muted playsInline className={`${busy || error ? 'hidden' : ''} aspect-square w-full rounded-xl bg-black object-cover max-sm:aspect-auto max-sm:min-h-0 max-sm:flex-1 max-sm:rounded-none`}/>
    {busy && <div role="status" className="flex min-h-48 items-center justify-center gap-3 max-sm:flex-1 max-sm:flex-col"><LoaderCircle className="animate-spin"/>Loading order details…</div>}
    {error && <div role="alert" className="space-y-4 rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200 max-sm:bg-transparent max-sm:p-0 max-sm:text-white"><p>{error}</p><button type="button" className="rounded-lg border border-current px-4 py-2 max-sm:w-full max-sm:min-h-12 max-sm:rounded-xl max-sm:border-0 max-sm:bg-blue-600 max-sm:font-semibold" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div>}
    <button type="button" disabled={busy} onClick={close} className="min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white disabled:opacity-50 sm:hidden">Close</button>
    <p className="text-sm sm:hidden">Scan a TENH POS order QR code or barcode.</p>
    </div>
  </Modal>;
}
