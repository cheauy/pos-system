"use client";

import {
  Check,
  Globe2,
  Languages,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme, accentColors } from "@/components/providers/theme-provider";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/components/providers/language-provider";
import type { AppLanguage } from "@/lib/i18n/translations";

type ThemeValue = "system" | "light" | "dark";

export default function AppearanceForm() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<ThemeValue>("system");

  useEffect(() => {
    if (theme === "light" || theme === "dark" || theme === "system") {
      setSelectedTheme(theme);
    }
  }, [theme]);

  function handleThemeChange(next: ThemeValue) {
    setSelectedTheme(next);
    setTheme(next);
  }

  function handleLanguageChange(next: AppLanguage) {
    setLanguage(next);
  }

  function handleReset() {
    setSelectedTheme("system");
    setTheme("system");
    setAccent('white');
    setLanguage("en");
    toast.success("Appearance reset to system defaults.");
  }

  function handleSave() {
    toast.success(
      language === "km"
        ? "បានរក្សាទុកការកំណត់រូបរាង និងភាសា។"
        : "Appearance and language saved.",
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-slate-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Palette className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-950 dark:text-white">
              Customize your experience
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Customize how Tenh POS looks and which language your team uses.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 px-5 sm:px-6 dark:divide-slate-800">
          <section className="py-6">
            <h3 className="font-bold">Colors</h3>
            <p className="mt-1 text-sm text-slate-500">White is the default. Colors apply to menus, workspace and panels in light or dark mode. Saved on this device.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(accentColors).map(([name, color]) => <button key={name} type="button" aria-pressed={accent === name} onClick={() => setAccent(name as keyof typeof accentColors)} className="flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold capitalize" style={{ borderColor: accent === name ? (name === 'white' ? '#64748b' : color) : undefined }}><span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200" style={{ background: color, color: name === 'white' ? '#334155' : '#ffffff' }}>{accent === name && <Check size={16} />}</span>{name}{name === 'white' && <span className="text-xs text-slate-500">Default</span>}</button>)}
            </div>
          </section>
          <section className="py-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                <Sun className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-950 dark:text-white">Theme</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Choose the default application theme.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <ThemeOption
                label="System"
                description="Follow device settings"
                checked={selectedTheme === "system"}
                onClick={() => handleThemeChange("system")}
                icon={Monitor}
              />
              <ThemeOption
                label="Light"
                description="Bright workspace for daytime use"
                checked={selectedTheme === "light"}
                onClick={() => handleThemeChange("light")}
                icon={Sun}
              />
              <ThemeOption
                label="Dark"
                description="Reduce eye strain in low light"
                checked={selectedTheme === "dark"}
                onClick={() => handleThemeChange("dark")}
                icon={Moon}
              />
            </div>
          </section>

          <section className="py-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                <Globe2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-950 dark:text-white">Language</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Choose the default application language.
                </p>
              </div>
            </div>

            <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
              <LanguageOption
                language="en"
                title="English"
                subtitle="Inter"
                active={language === "en"}
                onClick={() => handleLanguageChange("en")}
              />
              <LanguageOption
                language="km"
                title="ខ្មែរ"
                subtitle="Hanuman"
                active={language === "km"}
                onClick={() => handleLanguageChange("km")}
              />
            </div>

            <div className="mt-4 flex max-w-3xl items-start gap-3 rounded-xl bg-blue-50/70 px-4 py-3 text-sm text-slate-600 dark:bg-blue-950/20 dark:text-slate-300">
              <Languages className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
              <p data-i18n-ignore="true">
                English text uses <strong>Inter</strong>. អក្សរខ្មែរប្រើពុម្ពអក្សរ <strong>Hanuman</strong> សម្រាប់ការអានកាន់តែងាយស្រួល។
              </p>
            </div>
          </section>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Save className="h-4 w-4" />
          Save Appearance
        </button>
      </div>
    </div>
  );
}

function ThemeOption({
  label,
  description,
  checked,
  onClick,
  icon: Icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onClick: () => void;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`relative min-h-[104px] rounded-xl border p-4 text-left transition hover:border-blue-300 ${
        checked
          ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-100 dark:border-blue-500 dark:bg-blue-950/20 dark:ring-blue-950"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
      }`}
    >
      {checked ? (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}
      <Icon className="h-6 w-6 text-slate-500 dark:text-slate-300" />
      <p className="mt-3 text-sm font-bold text-slate-950 dark:text-white">{label}</p>
      <p className="mt-1 pr-6 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </button>
  );
}

function LanguageOption({
  language,
  title,
  subtitle,
  active,
  onClick,
}: {
  language: AppLanguage;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative rounded-xl border p-4 text-left transition hover:border-blue-300 ${
        active
          ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-100 dark:border-blue-500 dark:bg-blue-950/20 dark:ring-blue-950"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
      }`}
    >
      {active ? (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}
      <div className="flex items-center justify-between gap-3 pr-8">
        <div>
          <p data-i18n-ignore="true" className="font-bold text-slate-950 dark:text-white">
            {title}
          </p>
          <p data-i18n-ignore="true" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        </div>
        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold uppercase text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          {language === "en" ? "EN" : "KM"}
        </span>
      </div>
    </button>
  );
}
