"use client";

import {
  Languages,
  Monitor,
  Moon,
  Save,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/components/providers/language-provider";
import type { AppLanguage } from "@/lib/i18n/translations";

type ThemeValue = "system" | "light" | "dark";

export default function AppearanceForm() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] =
    useState<ThemeValue>("system");

  useEffect(() => {
    if (
      theme === "light" ||
      theme === "dark" ||
      theme === "system"
    ) {
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

  function handleSave() {
    toast.success(
      language === "km"
        ? "បានរក្សាទុកការកំណត់រូបរាង និងភាសា។"
        : "Appearance and language saved.",
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="border-b pb-5 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure the default theme and language for the POS.
          </p>
        </div>

        <div className="mt-6 space-y-8">
          <section className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Theme
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose the default application theme.
              </p>
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
                description="Always use light mode"
                checked={selectedTheme === "light"}
                onClick={() => handleThemeChange("light")}
                icon={Sun}
              />
              <ThemeOption
                label="Dark"
                description="Always use dark mode"
                checked={selectedTheme === "dark"}
                onClick={() => handleThemeChange("dark")}
                icon={Moon}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Language
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose the default application language.
              </p>
            </div>

            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
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

            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <Languages className="mt-0.5 h-5 w-5 shrink-0" />
              <p data-i18n-ignore="true">
                English text uses <strong>Inter</strong>. អក្សរខ្មែរប្រើពុម្ពអក្សរ <strong>Hanuman</strong>។
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
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
      className={`rounded-xl border p-4 text-left transition hover:border-blue-400 ${
        checked
          ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30"
          : "dark:border-gray-700 dark:bg-gray-900"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {label}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {description}
          </p>
        </div>
      </div>
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
      className={`rounded-xl border p-4 text-left transition hover:border-blue-400 ${
        active
          ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100 dark:border-blue-500 dark:bg-blue-950/30 dark:ring-blue-950"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            data-i18n-ignore="true"
            className="font-semibold text-slate-900 dark:text-slate-100"
          >
            {title}
          </p>
          <p
            data-i18n-ignore="true"
            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
          >
            {subtitle}
          </p>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {language}
        </span>
      </div>
    </button>
  );
}
