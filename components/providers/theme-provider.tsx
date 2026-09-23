"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeValue = "light" | "dark" | "system";
export const accentColors = { white: '#ffffff', blue: '#2563eb', violet: '#7c3aed', emerald: '#047857', rose: '#be123c', amber: '#b45309' } as const;
export type AccentColor = keyof typeof accentColors;
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeValue;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeValue) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
};

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: ThemeValue;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  attribute?: "class" | string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "theme";

function isTheme(value: string | null): value is ThemeValue {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeValue, disableTransition: boolean): ResolvedTheme {
  const resolved = theme === "system" ? systemTheme() : theme;
  const root = document.documentElement;

  let transitionStyle: HTMLStyleElement | null = null;
  if (disableTransition) {
    transitionStyle = document.createElement("style");
    transitionStyle.textContent =
      "*,*::before,*::after{transition:none!important;animation-duration:0s!important}";
    document.head.appendChild(transitionStyle);
  }

  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;

  if (transitionStyle) {
    // Force the style to take effect for this paint, then remove it immediately.
    void window.getComputedStyle(transitionStyle).opacity;
    window.setTimeout(() => transitionStyle?.remove(), 0);
  }

  return resolved;
}

export default function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const safeDefault = enableSystem ? defaultTheme : defaultTheme === "system" ? "light" : defaultTheme;
  const [theme, setThemeState] = useState<ThemeValue>(safeDefault);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [accent, setAccentState] = useState<AccentColor>('white');
  const setAccent = useCallback((next: AccentColor) => {
    if (!(next in accentColors)) return;
    setAccentState(next);
    document.documentElement.style.setProperty('--app-accent', next === 'white' ? '#2563eb' : accentColors[next]);
    document.documentElement.dataset.workspaceColor = next;
    try { localStorage.setItem('tenh-accent', next); } catch { /* Device storage unavailable. */ }
  }, []);
  useEffect(() => {
    const restore = () => {
      try { const value = localStorage.getItem('tenh-accent'); setAccent(value && value in accentColors ? value as AccentColor : 'white'); } catch { /* Keep white. */ }
    };
    restore();
    window.addEventListener('storage', restore);
    return () => window.removeEventListener('storage', restore);
  }, [setAccent]);

  const setTheme = useCallback(
    (next: ThemeValue) => {
      const safeNext = enableSystem ? next : next === "system" ? "light" : next;
      try {
        window.localStorage.setItem(STORAGE_KEY, safeNext);
      } catch {
        // Local storage may be unavailable in private/restricted browser contexts.
      }
      setThemeState(safeNext);
      setResolvedTheme(applyTheme(safeNext, disableTransitionOnChange));
    },
    [disableTransitionOnChange, enableSystem],
  );

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Fall back to the configured default.
    }

    const initial = isTheme(stored)
      ? enableSystem
        ? stored
        : stored === "system"
          ? "light"
          : stored
      : safeDefault;

    setThemeState(initial);
    setResolvedTheme(applyTheme(initial, false));
  }, [enableSystem, safeDefault]);

  useEffect(() => {
    if (theme !== "system" || !enableSystem) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setResolvedTheme(applyTheme("system", disableTransitionOnChange));
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [disableTransitionOnChange, enableSystem, theme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, accent, setAccent }),
    [resolvedTheme, setTheme, theme, accent, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return context;
}
