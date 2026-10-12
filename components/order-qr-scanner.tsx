'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle, ScanLine } from 'lucide-react';
import { Modal } from '@/app/(dashboard)/dashboard/pos/pos-workspace-components';
import { resolveOrderQr } from '@/lib/orders/resolve-order-qr';
import { cameraErrorMessage, classifySearchScan, scanFormats, type SearchScan } from '@/lib/search/scan-code';
import { useLanguage } from '@/components/providers/language-provider';

type Props = { onNavigate?: () => void; onScan?: (scan: SearchScan) => void };

export default function OrderQrScanner({ onNavigate, onScan }: Props = {}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const close = useCallback(() => setOpenPath(null), []);
  const pathname = usePathname();
  useEffect(() => () => close(), [pathname, close]);
  const { t } = useLanguage();
  const visible = openPath !== null && openPath === pathname;
  return <><button type="button" aria-label={t(onScan ? 'Scan code' : 'Scan order QR code')} title={t(onScan ? 'Scan code' : 'Scan order QR code')} onClick={() => setOpenPath(pathname)} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 ${onScan ? '' : 'xl:hidden'}`}><ScanLine size={20}/></button>
    {visible && <ScanDialog close={close} onNavigate={onNavigate} onScan={onScan}/>}</>;
}

function ScanDialog({ close, onNavigate, onScan }: Props & { close: () => void }) {
  const router = useRouter();
  const callbacks = useRef({ onNavigate, onScan });
  useEffect(() => { callbacks.current = { onNavigate, onScan }; }, [onNavigate, onScan]);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false, handled = false;
    let controls: { stop: () => void } | undefined;
    let stream: MediaStream | undefined;
    const element = video.current;
    const stop = () => { controls?.stop(); stream?.getTracks().forEach(track => track.stop()); if (element) element.srcObject = null; };
    const ended = () => { if (!cancelled && !handled) { handled = true; stop(); setReady(false); setError('Camera is unavailable or in use. Close other camera apps and try again.'); } };
    const navigation = () => { cancelled = true; stop(); close(); };
    window.addEventListener('popstate', navigation);
    window.addEventListener('pagehide', navigation);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera unavailable. Open this website over HTTPS to use the camera.'); return;
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        if (cancelled || !element) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) { stop(); return; }
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', ended));
        const reader = new BrowserMultiFormatReader();
        // ZXing otherwise drops EAN-13's first zero when UPC-A is also enabled. UPC-A is readable as EAN-13.
        reader.possibleFormats = scanFormats.filter(format => format !== 'UPC_A').map(format => BarcodeFormat[format]);
        controls = await reader.decodeFromStream(stream, element, async (result, failure, camera) => {
          if (cancelled || handled) return;
          if (!result) {
            if (failure && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(failure.name)) {
              handled = true; camera.stop(); stop(); setError('The scanner could not decode this frame. Please try again.');
            } else if (failure && failure.name !== 'NotFoundException') setHint('Code could not be read. Hold it steady inside the frame.');
            return;
          }
          const raw = result.getText();
          const scan = classifySearchScan(raw, BarcodeFormat[result.getBarcodeFormat()]);
          if (!scan) { setHint('Unsupported code. Scan a TENH POS order QR or a supported product barcode.'); return; }
          handled = true; camera.stop(); stop();
          if (callbacks.current.onScan) { close(); callbacks.current.onScan(scan); return; }
          if (scan.kind !== 'order') {
            window.dispatchEvent(new Event('tenh:close-navigation'));
            router.push(`/dashboard/search?q=${encodeURIComponent(scan.value)}&barcode=1`); close(); callbacks.current.onNavigate?.(); return;
          }
          setBusy(true);
          try {
            const order = await resolveOrderQr(raw);
            if (cancelled) return;
            if ('error' in order) { setError(order.error); setBusy(false); return; }
            window.dispatchEvent(new Event('tenh:close-navigation'));
            router.push(`/dashboard/orders/${order.id}?scanned=1`); close(); callbacks.current.onNavigate?.();
          } catch { if (!cancelled) { setError('Unable to load this order. Please try again.'); setBusy(false); } }
        });
        if (cancelled || handled) stop();
      } catch (failure) { stop(); if (!cancelled) setError(cameraErrorMessage(failure)); }
    }
    void start();
    return () => { cancelled = true; stream?.getVideoTracks().forEach(track => track.removeEventListener('ended', ended)); stop(); window.removeEventListener('popstate', navigation); window.removeEventListener('pagehide', navigation); };
  }, [attempt, router, close]);

  return <Modal title={t('Scan code')} onClose={close} locked={busy}>
    {/* Phones: full-screen dark camera view with Close and caption at the foot, like the mobile app scanner. */}
    <div className="max-sm:fixed max-sm:inset-0 max-sm:z-[60] max-sm:flex max-sm:flex-col max-sm:justify-end max-sm:gap-5 max-sm:bg-[#0f172a] max-sm:p-5 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:text-white">
    <p className="mb-3 text-sm text-slate-500 max-sm:hidden">Scan a TENH POS order QR code or barcode.</p>
    <video ref={video} muted playsInline onPlaying={() => setReady(true)} className={`${busy || error ? 'hidden' : ''} aspect-square w-full rounded-xl bg-black object-cover max-sm:aspect-auto max-sm:min-h-0 max-sm:flex-1 max-sm:rounded-none`}/>
    {!busy && !error && <p role="status" className="text-sm text-slate-500">{t(ready ? 'Camera ready' : 'Starting camera.')}{hint && <> · {t(hint)}</>}</p>}
    {busy && <div role="status" className="flex min-h-48 items-center justify-center gap-3 max-sm:flex-1 max-sm:flex-col"><LoaderCircle className="animate-spin"/>Loading order details…</div>}
    {error && <div role="alert" className="space-y-4 rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200 max-sm:bg-transparent max-sm:p-0 max-sm:text-white"><p>{error}</p><button type="button" className="rounded-lg border border-current px-4 py-2 max-sm:w-full max-sm:min-h-12 max-sm:rounded-xl max-sm:border-0 max-sm:bg-blue-600 max-sm:font-semibold" onClick={() => { setError(''); setHint(''); setReady(false); setAttempt(value => value + 1); }}>Try again</button></div>}
    <button type="button" disabled={busy} onClick={close} className="min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white disabled:opacity-50 sm:hidden">Close</button>
    <p className="text-sm sm:hidden">Scan a TENH POS order QR code or barcode.</p>
    </div>
  </Modal>;
}
