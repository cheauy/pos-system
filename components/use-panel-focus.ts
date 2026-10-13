"use client";
import { useEffect, useRef, useState, type RefObject } from "react";

// Existing custom sheets share the same focus/scroll rules, including nested native dialogs.
export default function usePanelFocus(root: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, compactOnly = false) {
  const close = useRef(onClose);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width:1279px), (max-width:1366px) and (pointer:coarse)");
    const update = () => setCompact(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const active = open && (!compactOnly || compact);
  useEffect(() => {
    const panel = root.current;
    if (!active || !panel) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const resize = () => panel.style.setProperty("--panel-height", `${viewport?.height ?? window.innerHeight}px`);
    resize(); viewport?.addEventListener("resize", resize);
    const controls = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const key = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const list = controls(), first = list[0], last = list.at(-1);
      if (!first) return;
      if (!panel.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", key); viewport?.removeEventListener("resize", resize); panel.style.removeProperty("--panel-height"); document.body.style.overflow = overflow; if (before?.isConnected) before.focus(); };
  }, [active, root]);
  return compact;
}
