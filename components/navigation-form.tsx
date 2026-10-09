"use client";
import { useLanguage } from "@/components/providers/language-provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { useActivity } from '@/components/ui/activity-link';
import { dateRangeError } from "@/lib/date-range";

type Field = HTMLInputElement | HTMLSelectElement;
// Puts every field back to its applied (server-rendered default) value.
function restore(form: HTMLFormElement) {
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) { if (el.type === "radio" || el.type === "checkbox") el.checked = el.defaultChecked; else el.value = el.defaultValue; el.setCustomValidity(""); }
    else if (el instanceof HTMLSelectElement) for (const option of Array.from(el.options)) option.selected = option.defaultSelected;
  }
}

// Filter edits stay a draft until Apply submits once. `reset` lists the values a type="reset"
// button puts into the draft (Apply commits them). Editing a date switches a `range` field to custom.
// Pages key this on their applied params (from the same render as the field defaults) so the
// fields remount at the shown filters after Apply or Back/Forward; React keeps a touched
// field's value and never updates a <select> default.
export default function NavigationForm({ children, className, reset, maxSpanDays }: { children: ReactNode; className?: string; reset?: Record<string, string>; maxSpanDays?: number }) {
  const { t: translateText } = useLanguage();
  const router = useRouter(); const path = usePathname(); const shown = useSearchParams().toString();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const lastQuery = useRef("");
  useActivity(pending);
  // Phone filter sheets close through a #hash link; closing discards unapplied edits.
  useEffect(() => {
    const discard = () => { if (form.current) restore(form.current); };
    window.addEventListener("hashchange", discard);
    return () => window.removeEventListener("hashchange", discard);
  }, []);
  // Back/Forward onto a #sheet entry made before an Apply: the entry has no Next.js state,
  // so the router ignores it and keeps showing the other filters. Load the entry's filters.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (event.state || location.pathname !== path || new URLSearchParams(location.search).toString() === shown) return;
      startTransition(() => router.replace(location.pathname + location.search + location.hash, { scroll: false }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [path, router, shown]);
  const field = (name: string) => form.current?.elements.namedItem(name) as Field | RadioNodeList | null;
  return <form ref={form} className={className} aria-busy={pending}
    onChange={e => {
      const target = e.target as unknown as Field; target.setCustomValidity?.("");
      // A date error must not block applying a preset range.
      for (const name of ["from", "to"]) { const el = field(name); if (el instanceof HTMLInputElement) el.setCustomValidity(""); }
      const range = field("range");
      if ((target.name === "from" || target.name === "to") && range && !(range instanceof HTMLInputElement && range.type === "hidden")) range.value = "custom";
    }}
    onReset={e => { if (!reset) return; e.preventDefault(); for (const [name, value] of Object.entries(reset)) { const el = field(name); if (el) { el.value = value; if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.setCustomValidity(""); } } }}
    onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const custom = !data.has("range") || data.get("range") === "custom";
      const from = String(data.get("from") ?? ""), to = String(data.get("to") ?? "");
      if (custom && data.has("from")) {
        const message = data.get("range") === "custom" && (!from || !to) ? "Choose both dates." : dateRangeError(from, to, maxSpanDays);
        const input = field(from ? "to" : "from") as HTMLInputElement | null;
        if (message && input) { input.setCustomValidity(translateText(message)); input.reportValidity(); return; }
      }
      const query = new URLSearchParams();
      // Preset ranges ignore the date fields; keep them out of the URL.
      data.forEach((value, key) => { if (typeof value === "string" && (custom || (key !== "from" && key !== "to"))) query.set(key, value); });
      // Ignore a repeat Apply of the same filters; a different selection replaces the pending one.
      if (pending && lastQuery.current === String(query)) return;
      lastQuery.current = String(query);
      startTransition(() => router.push(`${path}?${query}`, { scroll: false }));
    }}>{children}</form>;
}
