"use client";
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
export default function PrintButton({ label = "Print Receipt", selector = ".receipt", disabled = false }: { label?: string; selector?: string; disabled?: boolean }) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function handlePrint() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const content = document.querySelector(selector);
      if (!content) throw new Error("Print preview is unavailable. Reload and try again.");
      await Promise.race([
        Promise.all([document.fonts.ready, ...Array.from(content.querySelectorAll("img")).map(async image => {
          await image.decode();
          if (!image.naturalWidth) throw new Error("Image unavailable");
        })]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); }),
      ]);
      for (const item of content.querySelectorAll<HTMLElement>(".shipping-label")) {
        const heightMm = Number(item.dataset.heightMm);
        const widthMm = Number(item.dataset.widthMm);
        if (heightMm && item.getBoundingClientRect().height > item.getBoundingClientRect().width / widthMm * heightMm + 2) {
          throw new Error("This shipping label is too long for the selected paper. Choose a larger label or show fewer details in Printer Settings.");
        }
      }
      window.print();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(message.startsWith("This shipping") || message.startsWith("Print preview") ? message : "A logo, QR image or font could not load. Reload the preview and retry before printing.");
    } finally {
      clearTimeout(timer); locked.current = false; setBusy(false);
    }
  }
  return <div className="no-print"><button type="button" onClick={handlePrint} disabled={disabled || busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"><Printer size={19} />{busy ? "Preparing print…" : label}</button>{error && <p role="alert" className="mt-2 max-w-md text-sm text-red-700">{error}</p>}</div>;
}
