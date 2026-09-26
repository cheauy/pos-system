"use client";
import { useRef, useState, type RefObject } from "react";
import { Printer } from "lucide-react";
import { preparePrint } from '@/lib/printing/prepare-print';
export default function PrintButton({ label = "Print Receipt", selector = ".receipt", disabled = false, frame }: { label?: string; selector?: string; disabled?: boolean; frame?:RefObject<HTMLIFrameElement|null> }) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function handlePrint() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const printWindow=frame?frame.current?.contentWindow:window;
      if(!printWindow)throw new Error("Print preview is unavailable. Reload and try again.");
      const printDocument=printWindow.document;
      await preparePrint(printDocument,selector);
      if(frame&&frame.current?.contentWindow!==printWindow)throw new Error("Print preview was closed. Open it again to print.");
      printWindow.focus();
      printWindow.print();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(message.startsWith("This shipping") || message.startsWith("Print preview") ? message : "A logo, QR image or font could not load. Reload the preview and retry before printing.");
    } finally {
      locked.current = false; setBusy(false);
    }
  }
  return <div className="no-print"><button type="button" onClick={handlePrint} disabled={disabled || busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"><Printer size={19} />{busy ? "Preparing print…" : label}</button>{error && <p role="alert" className="mt-2 max-w-md text-sm text-red-700">{error}</p>}</div>;
}
