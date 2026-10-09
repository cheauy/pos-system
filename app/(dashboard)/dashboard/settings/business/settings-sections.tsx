"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";


// Old in-page anchors (#business-info, #branding, #ordering-fulfillment) keep working.
const HASH_SECTIONS: Record<string, SettingsSectionId> = { "business-info": "business-info", branding: "branding", "ordering-fulfillment": "storefront" };
// Fulfillment, then Online Orders, were merged into Storefront; old ?section= links follow them.
const SECTION_ALIASES: Record<string, SettingsSectionId> = { fulfillment: "storefront", "online-orders": "storefront" };

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const valueOf = (el: Control) =>
  el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? String(el.checked)
    : el instanceof HTMLInputElement && el.type === "file" ? Array.from(el.files ?? [], f => `${f.name}:${f.size}`).join()
      : el.value;

/**
 * Every section stays mounted and is only hidden with CSS, so drafts survive
 * switching and each form still submits exactly the fields it always did.
 */
export default function SettingsSections({ available, children }: { available: SettingsSectionId[]; children: ReactNode }) {
  const params = useSearchParams();
  const panel = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const raw = params.get("section");
  const requested = (raw && SECTION_ALIASES[raw]) || (raw as SettingsSectionId | null);
  const active: SettingsSectionId = requested && available.includes(requested) ? requested : "overview";
  const sections = SETTINGS_SECTIONS.filter(section => available.includes(section.id));
  // Consecutive sections sharing a group render under one heading; empty groups (no permission) disappear.
  const groups = sections.reduce<{ name: string | null; items: (typeof sections)[number][] }[]>((all, section) => {
    const last = all.at(-1);
    if (last && last.name === section.group) last.items.push(section);
    else all.push({ name: section.group, items: [section] });
    return all;
  }, []);

  function select(id: SettingsSectionId, replace = false) {
    const next = new URLSearchParams(window.location.search);
    next.set("section", id);
    window.history[replace ? "replaceState" : "pushState"](null, "", `?${next}`);
    panel.current?.scrollIntoView({ block: "nearest" });
  }

  useEffect(() => {
    // Section switches never add a hash, so a hash here always comes from an old link and wins.
    const target = HASH_SECTIONS[window.location.hash.slice(1)];
    if (target && available.includes(target)) select(target, true);
    // Mount-only: later hash changes are not used by this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phone/tablet tab strip: bring the active tab into view. The desktop sidebar never scrolls sideways.
  // Labels can widen after mount (Khmer is translated in the DOM, fonts load), so re-check on tab resize.
  useEffect(() => {
    const strip = nav.current;
    if (!strip) return;
    const reveal = () => {
      const tab = strip.querySelector<HTMLElement>('[aria-current="page"]');
      if (!tab || strip.scrollWidth <= strip.clientWidth) return;
      const start = tab.offsetLeft, end = start + tab.offsetWidth;
      if (start < strip.scrollLeft) strip.scrollLeft = start - 24;
      else if (end > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = end - strip.clientWidth + 24;
    };
    reveal();
    const resized = new ResizeObserver(reveal);
    strip.querySelectorAll("a").forEach(tab => resized.observe(tab));
    return () => resized.disconnect();
  }, [active]);

  // Per-control baseline: a section is "unsaved" while one of its fields differs
  // from the value it had when loaded or last saved by its own form.
  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    const baseline = new Map<Control, string>();
    let frame: number | null = null;
    const controls = () => Array.from(root.querySelectorAll<Control>("[data-section] [name]"));
    const check = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const changed = new Set<string>();
        for (const el of controls()) {
          if (!baseline.has(el)) baseline.set(el, valueOf(el));
          if (baseline.get(el) !== valueOf(el)) el.closest("[data-section]")?.getAttribute("data-section")?.split(" ").forEach(id => changed.add(id));
        }
        setUnsaved(previous => {
          const next = [...changed].sort();
          return next.join() === previous.join() ? previous : next;
        });
      });
    };
    const saved = new MutationObserver(records => {
      for (const record of records) {
        const form = record.target as HTMLFormElement;
        if (form.dataset.dirty !== "false") continue;
        for (const el of controls()) if (el.form === form) baseline.set(el, valueOf(el));
      }
      check();
    });
    saved.observe(root, { subtree: true, attributeFilter: ["data-dirty"] });
    // A required field in a hidden section would otherwise block Save silently.
    const invalid = (event: Event) => {
      const el = event.target as Control;
      const owner = el.closest("[data-section]")?.getAttribute("data-section")?.split(" ") as SettingsSectionId[] | undefined;
      const current = root.getAttribute("data-active") as SettingsSectionId;
      if (!owner || owner.includes(current)) return;
      select(owner[0]);
      requestAnimationFrame(() => requestAnimationFrame(() => el.reportValidity()));
    };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest<HTMLElement>("[data-section-link]");
      const id = anchor?.dataset.sectionLink as SettingsSectionId | undefined;
      if (!id || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      select(id);
    };
    root.addEventListener("input", check, true);
    root.addEventListener("change", check, true);
    root.addEventListener("click", check, true);
    root.addEventListener("invalid", invalid, true);
    root.addEventListener("click", link);
    check();
    return () => {
      saved.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      root.removeEventListener("input", check, true);
      root.removeEventListener("change", check, true);
      root.removeEventListener("click", check, true);
      root.removeEventListener("invalid", invalid, true);
      root.removeEventListener("click", link);
    };
    // select only reads window.location, so the listeners never go stale.
  }, []);

  return (
    <div className="bs-layout">
      {/* Desktop: grouped sidebar. Phones/tablets: the same links as a horizontal, scrollable tab strip (settings-layout.css). */}
      <nav ref={nav} aria-label="Business settings sections" className="bs-nav">
        {groups.map(group => (
          <div key={group.name ?? "top"} className="bs-group" role="group" aria-labelledby={group.name ? `bs-group-${group.name}` : undefined}>
            {group.name ? <p id={`bs-group-${group.name}`} className="bs-group-title" data-i18n-ignore="true">{group.name}</p> : null}
            <ul>
              {group.items.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <a href={`?section=${id}`} aria-current={active === id ? "page" : undefined}
                    onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); select(id); }}>
                    <Icon size={17} aria-hidden="true" />
                    <span>{label}</span>
                    {unsaved.includes(id) ? <span className="bs-unsaved" title="Unsaved changes"><span className="sr-only">Unsaved changes</span></span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div ref={panel} className="bs-panel" data-active={active}>{children}</div>
    </div>
  );
}
