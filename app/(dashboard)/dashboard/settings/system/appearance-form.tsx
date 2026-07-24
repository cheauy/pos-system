"use client";

import {
  useActionState,
  useState,
  type ComponentType,
} from "react";
import {
  Languages,
  Monitor,
  Moon,
  Save,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  updateAppearanceSettings,
  type AppearanceActionState,
} from "./actions";

export type AppearanceSettings = {
  id: string;
  default_theme: "system" | "light" | "dark";
  default_language: "en" | "km";
};

type AppearanceFormProps = {
  settings: AppearanceSettings;
};

type ThemeValue = AppearanceSettings["default_theme"];
type LanguageValue = AppearanceSettings["default_language"];

const initialState: AppearanceActionState = {
  success: false,
  message: "",
};

export default function AppearanceForm({
  settings,
}: AppearanceFormProps) {
  const [state, formAction, pending] = useActionState(
    updateAppearanceSettings,
    initialState,
  );

  const { setTheme } = useTheme();

  const [selectedTheme, setSelectedTheme] =
    useState<ThemeValue>(settings.default_theme);

  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguageValue>(settings.default_language);

  function handleThemeChange(theme: ThemeValue) {
    setSelectedTheme(theme);
    setTheme(theme);
  }

  function handleLanguageChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    const language = event.target.value as LanguageValue;

    setSelectedLanguage(language);
    document.documentElement.lang = language;
  }

  return (
    <form action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="settings_id"
        value={settings.id}
      />

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
                id="theme-system"
                name="default_theme"
                value="system"
                label="System"
                description="Follow device settings"
                checked={selectedTheme === "system"}
                onChange={() =>
                  handleThemeChange("system")
                }
                icon={Monitor}
              />

              <ThemeOption
                id="theme-light"
                name="default_theme"
                value="light"
                label="Light"
                description="Always use light mode"
                checked={selectedTheme === "light"}
                onChange={() =>
                  handleThemeChange("light")
                }
                icon={Sun}
              />

              <ThemeOption
                id="theme-dark"
                name="default_theme"
                value="dark"
                label="Dark"
                description="Always use dark mode"
                checked={selectedTheme === "dark"}
                onChange={() =>
                  handleThemeChange("dark")
                }
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

            <div className="relative max-w-md">
              <Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <select
                name="default_language"
                value={selectedLanguage}
                onChange={handleLanguageChange}
                className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-950"
              >
                <option value="en">English</option>
                <option value="km">ខ្មែរ</option>
              </select>
            </div>
          </section>
        </div>
      </div>

      {state.message && (
        <div
          className={
            state.success
              ? "rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
              : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          }
        >
          {state.message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />

          {pending
            ? "Saving..."
            : "Save Appearance"}
        </button>
      </div>
    </form>
  );
}

type ThemeOptionProps = {
  id: string;
  name: string;
  value: ThemeValue;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  icon: ComponentType<{
    className?: string;
  }>;
};

function ThemeOption({
  id,
  name,
  value,
  label,
  description,
  checked,
  onChange,
  icon: Icon,
}: ThemeOptionProps) {
  return (
    <label
      htmlFor={id}
      className="cursor-pointer rounded-xl border p-4 transition hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500 dark:has-[:checked]:border-blue-500 dark:has-[:checked]:bg-blue-950/30"
    >
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="mt-1"
        />

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
    </label>
  );
}