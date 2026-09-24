'use client';

import { useState, type ReactNode } from 'react';
import { Check, Contrast, Layers, Languages, List, Monitor, Moon, Palette, Plus, RotateCcw, Save, Sun, Type, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/providers/theme-provider';
import { useLanguage } from '@/components/providers/language-provider';
import { accentColors, appearancePalette, defaultAppearance, normalizeAppearance, type Appearance } from '@/lib/appearance';
import type { AppLanguage } from '@/lib/i18n/translations';

type Draft = Appearance & { language: AppLanguage };
const card = 'rounded-2xl border border-slate-200/70 bg-white/80 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/80';
const choice = 'relative rounded-xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
const chosen = 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-100 dark:bg-sky-950/40 dark:ring-sky-900';
const idle = 'border-slate-200 bg-white/60 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900/50';

export default function AppearanceForm() {
  const saved = useTheme();
  const { language, setLanguage } = useLanguage();
  // Draft exists only on this page. No provider, cookie or storage changes until Save.
  const [draft, setDraft] = useState<Draft | null>(null);
  const current: Draft = { ...normalizeAppearance(saved), language };
  const selected = draft ?? current;
  const dark = selected.theme === 'dark' || (selected.theme === 'system' && saved.systemTheme === 'dark');
  const dirty = JSON.stringify(selected) !== JSON.stringify(current);
  const palette = appearancePalette(selected);
  function change(patch: Partial<Draft>) { setDraft({ ...selected, ...patch }); }
  function save() {
    try {
      saved.saveAppearance(selected);
      setLanguage(selected.language);
      setDraft(null);
      toast.success(selected.language === 'km' ? 'បានរក្សាទុកការកំណត់រូបរាង និងភាសា។' : 'Appearance and language saved.');
    } catch { toast.error('Unable to save on this device. Allow browser storage and try again.'); }
  }

  return <div className="space-y-4">
    <fieldset disabled={!saved.ready} className="space-y-4 disabled:opacity-60">
      {!dark && <section className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Heading icon={Palette} title="Color theme" description="Choose a color for the sidebar and interface accents." />
          <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800"><span className="mr-1 text-[10px] font-semibold text-slate-500 dark:text-slate-300">Preview</span><span className="h-4 w-4 rounded border border-black/10" style={{ background: palette.background }} /><span className="h-4 w-4 rounded" style={{ background: palette.action }} /><span className="h-4 w-4 rounded border border-black/10" style={{ background: palette.foreground }} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {Object.entries(accentColors).map(([name, color]) => <button key={name} type="button" aria-pressed={selected.accent === name} onClick={() => change({ accent: name as Appearance['accent'] })} className={`${choice} ${selected.accent === name ? chosen : idle} p-3`}>
            <span className="mb-3 block h-10 w-12 rounded-lg border border-black/10" style={{ background: color }} />
            <span className="block text-xs font-bold capitalize text-slate-900 dark:text-slate-100">{name}</span><span data-i18n-ignore="true" className="mt-0.5 block text-[10px] uppercase text-slate-500 dark:text-slate-400">{color}</span>
            {selected.accent === name && <Selected />}
          </button>)}
          <button type="button" aria-pressed={selected.accent === 'custom'} onClick={() => change({ accent: 'custom' })} className={`${choice} ${selected.accent === 'custom' ? chosen : idle} p-3`}>
            <span className="mb-3 flex h-10 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-500" style={selected.accent === 'custom' ? { background: selected.customColor, color: palette.foreground } : undefined}><Plus size={20} /></span><span className="block text-xs font-bold text-slate-900 dark:text-slate-100">Custom color</span><span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Choose any color</span>{selected.accent === 'custom' && <Selected />}
          </button>
        </div>
        {selected.accent === 'custom' && <label className="mt-3 flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">Choose custom color<input type="color" value={selected.customColor} onChange={e => change({ customColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-transparent p-1" /><span data-i18n-ignore="true" className="font-mono uppercase">{selected.customColor}</span></label>}
      </section>}

      <section className={card}><Heading icon={Moon} title="Theme mode" description="Choose how your app looks. System will match your device settings." /><div className="mt-4 grid gap-2 sm:grid-cols-3">
        {([{ value: 'system', label: 'System', description: 'Automatically match your device settings', icon: Monitor }, { value: 'light', label: 'Light', description: 'Clean and bright for everyday use', icon: Sun }, { value: 'dark', label: 'Dark', description: 'Easy on the eyes in low light', icon: Moon }] as const).map(option => <Option key={option.value} active={selected.theme === option.value} onClick={() => change({ theme: option.value })} icon={option.icon} label={option.label} description={option.description} />)}
      </div></section>

      <section className={card}><Heading icon={Languages} title="Language" description="Choose your preferred language for the interface." /><div className="mt-4 grid gap-2 sm:grid-cols-2">
        {([{ value: 'en', title: 'English', font: 'Inter font', description: 'A clean and modern font', flag: '🇺🇸', badge: 'EN' }, { value: 'km', title: 'ខ្មែរ', font: 'Hanuman', description: 'អក្សរខ្មែរងាយស្រួលអាន', flag: '🇰🇭', badge: 'KM' }] as const).map(option => <button key={option.value} type="button" aria-pressed={selected.language === option.value} onClick={() => change({ language: option.value })} className={`${choice} ${selected.language === option.value ? chosen : idle} flex gap-3 p-4 pr-12`}>
          <span aria-hidden className="text-xl">{option.flag}</span><span data-i18n-ignore="true" className="min-w-0"><span className="block text-sm font-bold text-slate-900 dark:text-white">{option.title}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{option.font}</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{option.description}</span></span><span className="absolute right-10 top-4 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">{option.badge}</span>{selected.language === option.value && <Selected />}
        </button>)}
      </div></section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className={card}><Heading icon={Type} title="Text size" description="Adjust text size across the app." /><div className="mt-4 grid grid-cols-3 gap-2">{(['small', 'medium', 'large'] as const).map(size => <button key={size} type="button" aria-pressed={selected.textSize === size} onClick={() => change({ textSize: size })} className={`${choice} ${selected.textSize === size ? chosen : idle} py-3 text-center`}><span className={`block font-semibold text-slate-700 dark:text-slate-200 ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-lg' : 'text-sm'}`}>Aa</span><span className="mt-1 block text-[10px] capitalize text-slate-600 dark:text-slate-300">{size}</span></button>)}</div></section>
        <section className={card}><Heading icon={Layers} title="Interface density" description="Choose how compact the layout feels." /><div className="mt-4 grid grid-cols-2 gap-2">{(['compact', 'comfortable'] as const).map(density => <button key={density} type="button" aria-pressed={selected.density === density} onClick={() => change({ density })} className={`${choice} ${selected.density === density ? chosen : idle} p-3`}><List size={17} className="mb-1 text-slate-600 dark:text-slate-300" /><span className="block text-[11px] font-semibold capitalize text-slate-700 dark:text-slate-200">{density}</span><span className="mt-0.5 block text-[9px] text-slate-500 dark:text-slate-400">{density === 'compact' ? 'More content' : 'More breathing room'}</span></button>)}</div></section>
        <section className={card}><Heading icon={Contrast} title="Accessibility" description="Improve visibility with higher contrast." /><label className="mt-5 flex cursor-pointer items-center justify-between gap-3"><span><span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">High contrast mode</span><span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">Stronger colors and clearer borders</span></span><span className="relative shrink-0"><input type="checkbox" role="switch" checked={selected.highContrast} onChange={e => change({ highContrast: e.target.checked })} className="peer sr-only" /><span className="block h-6 w-10 rounded-full bg-slate-300 transition peer-checked:bg-cyan-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-500" /><span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" /></span></label></section>
      </div>
    </fieldset>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"><p className="text-xs text-slate-500 dark:text-slate-400" role="status">{dirty ? 'Unsaved changes. Click Save to apply.' : 'Your preferences are saved on this device.'}</p><div className="flex gap-2"><button type="button" disabled={!saved.ready} onClick={() => setDraft({ ...defaultAppearance, language: 'en' })} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RotateCcw size={14} />Reset</button><button type="button" disabled={!saved.ready || !dirty} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"><Save size={14} />Save changes</button></div></div>
  </div>;
}

function Selected() { return <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-700 text-white"><Check size={11} strokeWidth={3} /></span>; }
function Heading({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200"><Icon size={18} /></span><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{description}</p></div></div>;
}
function Option({ active, onClick, icon: Icon, label, description }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string; description: ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`${choice} ${active ? chosen : idle} flex items-start gap-3 p-4 pr-8`}><Icon size={21} className={active ? 'shrink-0 text-sky-600' : 'shrink-0 text-slate-500 dark:text-slate-300'} /><span><span className="block text-sm font-bold text-slate-900 dark:text-white">{label}</span><span className="mt-1 block max-w-36 text-[11px] text-slate-500 dark:text-slate-400">{description}</span></span>{active ? <Selected /> : <span className="absolute right-2 top-2 h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600" />}</button>;
}
