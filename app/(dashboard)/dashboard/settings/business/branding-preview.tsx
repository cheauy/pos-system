"use client";

import { useEffect, useState } from "react";
import { Monitor, ShoppingBag, Smartphone, Store } from "lucide-react";

import { storefrontTheme } from "@/lib/storefront/theme";

type Values = { logo: string | null; banner: string | null; description: string; color: string; currency: string; language: string; style: string };

const field = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);

/**
 * Reads the unsaved Branding fields from the page and renders them with the storefront's own
 * theme rules (storefrontTheme). Purely local: no requests, no saving, no publishing.
 */
export default function BrandingPreview({ name, initial }: { name: string; initial: Values }) {
  const [values, setValues] = useState(initial);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    let frame: number | null = null;
    const urls = new Map<File, string>();
    const image = (key: "logo" | "banner", saved: string | null) => {
      if (field<HTMLInputElement>(`#business-info [name="remove-${key}"]`)?.value === "on") return null;
      const file = field<HTMLInputElement>(`#business-info input[type=file][name="${key}"]`)?.files?.[0];
      if (!file) return saved;
      if (!urls.has(file)) urls.set(file, URL.createObjectURL(file));
      return urls.get(file)!;
    };
    const read = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const color = field<HTMLInputElement>("#primaryColor")?.value ?? initial.color;
        setValues({
          logo: image("logo", initial.logo),
          banner: image("banner", initial.banner),
          description: field<HTMLTextAreaElement>("#business-info [name=description]")?.value ?? initial.description,
          color: /^#[0-9a-f]{6}$/i.test(color) ? color : initial.color,
          currency: field<HTMLInputElement>("#store-settings-form [name=currency]")?.value ?? initial.currency,
          language: field<HTMLInputElement>("#store-settings-form [name=defaultLanguage]")?.value ?? initial.language,
          style: field<HTMLInputElement>("#store-settings-form [name=storefrontStyle]")?.value ?? initial.style,
        });
      });
    };
    for (const type of ["input", "change", "click"]) document.addEventListener(type, read, true);
    return () => {
      for (const type of ["input", "change", "click"]) document.removeEventListener(type, read, true);
      if (frame !== null) cancelAnimationFrame(frame);
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [initial]);

  const km = values.language === "km";
  const price = values.currency === "KHR" ? "40,000៛" : "$10.00";
  return (
    <section aria-labelledby="branding-preview-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="branding-preview-title" className="text-base font-extrabold text-slate-950 dark:text-white">Live preview</h3>
          <p className="mt-1 text-xs leading-4 text-slate-500">Shows unsaved changes. Nothing is published until you save.</p>
          {values.style !== "simple" ? <p className="mt-1 text-xs leading-4 text-amber-700">This preview shows the Simple style. Choose Simple under Storefront style to give your store this look; Classic keeps your current layout.</p> : null}
        </div>
        <div role="group" aria-label="Preview size" className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
          {([[false, "Desktop", Monitor], [true, "Mobile", Smartphone]] as const).map(([value, label, Icon]) => (
            <button key={label} type="button" aria-pressed={mobile === value} onClick={() => setMobile(value)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${mobile === value ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"}`}>
              <Icon size={14} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-slate-100 p-3 dark:bg-slate-950">
        <div lang={values.language} style={storefrontTheme(values.color)}
          className={`mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white text-[#13223d] shadow-sm transition-[max-width] ${mobile ? "max-w-[360px]" : "max-w-full"}`}>
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              {values.logo ? <img src={values.logo} alt="" className="h-full w-full object-contain" /> : <Store size={16} className="text-slate-400" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span>
            <ShoppingBag size={16} aria-hidden="true" />
          </div>
          <div className={`relative bg-[var(--store-primary-soft,#eff6ff)] ${mobile ? "h-28" : "h-40"}`}>
            {values.banner ? <img src={values.banner} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ background: "linear-gradient(135deg, var(--store-primary), var(--store-primary-surface))" }} />}
          </div>
          <div className="space-y-3 p-3">
            {values.description ? <p className="line-clamp-2 break-words text-xs leading-5 text-slate-600">{values.description}</p> : null}
            <div className={`grid gap-2 ${mobile ? "grid-cols-2" : "grid-cols-4"}`}>
              {Array.from({ length: mobile ? 2 : 4 }, (_, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-2">
                  <div className="aspect-square rounded-md bg-slate-100" />
                  <p className="mt-1.5 h-2 w-3/4 rounded bg-slate-200" />
                  <p className="mt-1 text-xs font-bold">{price}</p>
                </div>
              ))}
            </div>
            <span className="inline-flex min-h-9 items-center rounded-lg px-4 text-xs font-semibold" style={{ backgroundColor: "var(--store-primary-surface)", color: "var(--store-on-primary)" }}>
              {km ? "បញ្ចូលទៅកន្ត្រក" : "Add to cart"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
