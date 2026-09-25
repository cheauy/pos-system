'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Barcode, Camera, Package, X } from 'lucide-react';
import type { SaleReceipt } from './pos-workspace-types';
import { money } from './pos-workspace-helpers';
import s from './pos-workspace.module.css';
import ProductPhoto from '@/components/product-photo';

export function Modal({ title, children, onClose, wide = false, locked = false, paper = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; locked?: boolean; paper?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`${s.dialog} ${wide ? s.dialogWide : ''} ${paper ? s.paperDialog : ''}`} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !locked) onClose(); }}>
    <div className={s.modalInner}>
      <header className={s.modalHeader}><h2>{title}</h2><button type="button" className={s.iconButton} onClick={onClose} disabled={locked} aria-label="Close dialog"><X size={19} /></button></header>
      <div className={s.modalBody}>{children}</div>
    </div>
  </dialog>;
}

export function ProductImage({ src, alt, className = '', loading = 'lazy' }: { src: string | null; alt: string; className?: string; loading?: 'eager' | 'lazy' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <ProductPhoto loading={loading} className={className} src={src} alt={alt} sizes="(max-width: 640px) 45vw, 200px" onError={() => setFailed(true)} /> : <span className={`${s.imageFallback} ${className}`} role="img" aria-label={`${alt} — no image`}><Package size={32} /></span>;
}

type DetectorInstance = { detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type DetectorConstructor = { new(options: { formats: string[] }): DetectorInstance; getSupportedFormats?: () => Promise<string[]> };
export function BarcodeScanner({ onScan }: { onScan: (code: string) => boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const scanCallback = useRef(onScan);
  scanCallback.current = onScan;
  function stop() {
    cancelled.current = true;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
  }
  useEffect(() => () => {
    cancelled.current = true;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);
  async function start() {
    setError('');
    const Detector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError('Camera scanning needs HTTPS or localhost. A USB scanner or typed barcode still works below.'); return; }
    if (!Detector) { setError('This browser does not support camera barcode detection. Use a USB scanner or enter the barcode below.'); return; }
    setStarting(true); cancelled.current = false;
    try {
      const formats = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : ['code_128', 'ean_13', 'ean_8', 'upc_a', 'code_39'];
      if (!formats.length) throw new Error('This browser does not expose a supported barcode format.');
      const detector = new Detector({ formats });
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (cancelled.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      setActive(true);
      const scan = async () => {
        if (cancelled.current || !video.current) return;
        try {
          const codes = await detector.detect(video.current);
          if (cancelled.current) return;
          const value = codes.find(c => c.rawValue)?.rawValue?.trim();
          if (value) {
            setCode(value);
            if (scanCallback.current(value)) { stop(); return; }
            setError('No unique product matched this barcode. Check the code or search the catalog.');
            stop(); return;
          }
        } catch { if (!cancelled.current) setError('The camera could not read this frame. Hold the barcode steady, or type its value.'); }
        if (!cancelled.current) timer.current = setTimeout(scan, 300);
      };
      void scan();
    } catch (e) { stop(); setError(e instanceof Error ? e.message : 'Camera permission was denied. Use manual scanning below.'); }
    finally { setStarting(false); }
  }
  return <div className={s.stack}>
    <p className={s.muted}>Scan with a USB/Bluetooth barcode reader, or enter an exact barcode or SKU and press Enter. Camera access starts only when you choose it.</p>
    <form className={s.row} onSubmit={event => { event.preventDefault(); setError(''); if (!code.trim() || !onScan(code.trim())) setError('No unique product matched that barcode or SKU.'); }}>
      <input autoFocus aria-label="Barcode or SKU" value={code} onChange={event => setCode(event.target.value)} placeholder="Barcode or SKU" maxLength={128} />
      <button className={s.primary} type="submit"><Barcode size={17} /> Find item</button>
    </form>
    <video ref={video} className={s.camera} hidden={!active} playsInline muted aria-label="Barcode camera preview" />
    <button type="button" className={s.button} onClick={active ? stop : start} disabled={starting}><Camera size={17} />{starting ? 'Starting camera…' : active ? 'Stop camera' : 'Use camera'}</button>
    {error && <p role="alert" className={s.notice}>{error}</p>}
  </div>;
}

export { PosReceipt as ReceiptContent } from '@/components/receipts/pos-receipt';
