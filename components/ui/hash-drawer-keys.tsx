"use client";
import { useEffect } from "react";

// Server pages open right drawers through a #hash (CSS :target). This adds the keyboard
// parts: Escape closes the open drawer, focus moves into it and back to the row that
// opened it, and closing discards unsaved form edits inside the drawer. It also makes a
// #hash in the loaded URL open its popup (e.g. /dashboard/promotions#create-promotion).
export default function HashDrawerKeys() {
  useEffect(() => {
    let opener: HTMLElement | null = null;
    let open: HTMLElement | null = null;
    // Fragment navigation moves focus before hashchange fires, so remember the clicked link.
    let clicked: HTMLElement | null = null;
    const onClick = (event: MouseEvent) => { clicked = (event.target as Element | null)?.closest<HTMLElement>('a[href^="#"]') ?? null; };
    // :target, not location.hash: a server action save drops the hash but leaves the drawer open.
    const current = () => { const drawer = document.querySelector<HTMLElement>('[role="dialog"][data-sheet="right"]:target'); return drawer?.getClientRects().length ? drawer : null; };
    const onHash = () => {
      const drawer = current();
      if (open && open !== drawer) open.querySelectorAll("form").forEach((form) => form.reset());
      if (drawer) {
        if (!open) opener = clicked;
        drawer.querySelector<HTMLElement>("[data-drawer-close]")?.focus({ preventScroll: true });
      } else if (open) {
        opener?.focus({ preventScroll: true });
        opener = null;
      }
      open = drawer;
    };
    const onKey = (event: KeyboardEvent) => {
      const drawer = current();
      if (!drawer) return;
      if (event.key === "Escape") location.hash = "close";
      if (event.key !== "Tab") return;
      const fields = Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')).filter(el => el.tabIndex >= 0 && !el.hasAttribute("disabled") && el.getClientRects().length);
      const first = fields[0], last = fields[fields.length - 1];
      if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    };
    // A streamed page can miss the URL's #target on first load; repeat the fragment
    // navigation (replacing the entry, so Back is unchanged) once the element exists.
    let id = location.hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* Unknown fragments must not prevent drawer setup. */ }
    const target = id ? document.getElementById(id) : null;
    if (target && !target.matches(":target")) {
      history.replaceState(history.state, "", location.pathname + location.search);
      location.replace(`#${encodeURIComponent(id)}`);
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("hashchange", onHash); document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick, true); };
  }, []);
  return null;
}
