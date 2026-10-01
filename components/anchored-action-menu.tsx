"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

export default function AnchoredActionMenu({ label, disabled = false, iconOnly = false, children }: { label: string; disabled?: boolean; iconOnly?: boolean; children: ReactNode }) {
  const id = useId(), button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  function position() {
    const popup = menu.current, anchor = button.current;
    if (!popup || !anchor || !popup.matches(":popover-open")) return;
    const rect = anchor.getBoundingClientRect(), gap = 6, margin = 8;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth), bottom = top + (viewport?.height ?? window.innerHeight);
    if (rect.bottom < top || rect.top > bottom || rect.right < left || rect.left > right) { popup.hidePopover(); return; }
    popup.style.maxWidth = `${right - left - margin * 2}px`;
    const below = bottom - rect.bottom - gap - margin, above = rect.top - top - gap - margin;
    const openAbove = below < popup.scrollHeight && above > below;
    popup.style.maxHeight = `${Math.max(40, openAbove ? above : below)}px`;
    popup.style.left = `${Math.max(left + margin, Math.min(rect.left, right - popup.offsetWidth - margin))}px`;
    popup.style.top = `${Math.max(top + margin, openAbove ? rect.top - popup.offsetHeight - gap : rect.bottom + gap)}px`;
  }
  useEffect(() => {
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); window.visualViewport?.removeEventListener("resize", position); };
  }, []);
  return <div className="shrink-0">
    <button ref={button} type="button" popoverTarget={id} disabled={disabled} aria-label={label} className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45 ${iconOnly ? "w-9" : "border border-slate-200 bg-white px-3"}`}>{iconOnly ? <MoreHorizontal size={20} /> : <>{label}<ChevronDown size={14} /></>}</button>
    <div ref={menu} id={id} popover="auto" onToggle={position} className="fixed inset-auto m-0 w-max max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" onClick={event => { if ((event.target as HTMLElement).closest("button")) menu.current?.hidePopover(); }} onChange={() => menu.current?.hidePopover()}>
      <div className="flex flex-col items-start gap-1 [&>button]:justify-start [&>label]:justify-start">{children}</div>
    </div>
  </div>;
}
