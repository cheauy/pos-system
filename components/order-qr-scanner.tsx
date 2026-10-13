'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Camera, LoaderCircle, ScanLine } from 'lucide-react';
import { Modal } from '@/app/(dashboard)/dashboard/pos/pos-workspace-components';
import { resolveOrderQr } from '@/lib/orders/resolve-order-qr';
import { cameraErrorMessage, classifySearchScan, scanFormats, type SearchScan } from '@/lib/search/scan-code';
import { useLanguage } from '@/components/providers/language-provider';
import styles from './order-qr-scanner.module.css';

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

  return <Modal title={t('Scan code')} onClose={close} bare>
    <div className={styles.card}>
      <h3>{t('Scan code')}</h3><p className={styles.brand}>TENH POS</p>
      <p className={styles.guide}>{t('Align a QR code or barcode inside the frame.')}</p>
      <div className={styles.preview} hidden={Boolean(error) || busy}>
        <video ref={video} muted playsInline onPlaying={() => setReady(true)} aria-label={t('Camera preview')}/>
        {ready && <span className={styles.frame} aria-hidden="true"><i/><i/><i/><i/></span>}
      </div>
      {error ? <div role="alert" className={styles.error}><p>{t(error)}</p><button type="button" className={`${styles.action} ${styles.retry}`} onClick={() => { setError(''); setHint(''); setReady(false); setAttempt(value => value + 1); }}>{t('Try again')}</button></div>
        : <><p role="status" className={styles.status}>{busy || !ready ? <LoaderCircle size={20} className="animate-spin"/> : <Camera size={20}/>} {t(busy ? 'Loading order details…' : ready ? 'Camera ready' : 'Starting camera…')}</p>{hint && <p role="status">{t(hint)}</p>}<p className={styles.caption}>{t('Supports TENH POS order QR codes and product barcodes.')}</p></>}
      <button type="button" onClick={close} className={styles.action}>{t('Close scanner')}</button>
    </div>
  </Modal>;
}
