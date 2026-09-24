'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APPEARANCE_STORAGE_KEY, appearancePalette, defaultAppearance, normalizeAppearance, type Appearance, type ThemeValue } from '@/lib/appearance';
export { accentColors, accentTextColors, type AccentColor, type ThemeValue } from '@/lib/appearance';

type ThemeContextValue = Appearance & {
  ready: boolean;
  resolvedTheme: 'light' | 'dark';
  systemTheme: 'light' | 'dark';
  saveAppearance: (next: Appearance) => void;
  setScope: (scope: string) => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyAppearance(value: Appearance, systemDark: boolean) {
  const root = document.documentElement;
  const resolved = value.theme === 'system' ? systemDark ? 'dark' : 'light' : value.theme;
  const palette = appearancePalette(value, resolved);
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.style.setProperty('--app-accent', palette.action);
  root.style.setProperty('--sidebar-background', palette.background);
  root.style.setProperty('--sidebar-foreground', palette.foreground);
  root.dataset.workspaceColor = value.accent;
  root.dataset.textSize = value.textSize;
  root.dataset.density = value.density;
  root.dataset.highContrast = String(value.highContrast);
  return resolved;
}

export default function ThemeProvider({ children, defaultTheme = 'system', enableSystem = true }: {
  children: ReactNode; defaultTheme?: ThemeValue; enableSystem?: boolean; disableTransitionOnChange?: boolean; attribute?: string;
}) {
  const [preferences, setPreferences] = useState<Appearance>({ ...defaultAppearance, theme: defaultTheme });
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState(APPEARANCE_STORAGE_KEY);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  const apply = useCallback((value: Appearance) => {
    const next = normalizeAppearance(value);
    if (!enableSystem && next.theme === 'system') next.theme = 'light';
    setPreferences(next);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setSystemTheme(systemDark ? 'dark' : 'light');
    setResolvedTheme(applyAppearance(next, systemDark));
  }, [enableSystem]);

  useEffect(() => {
    function restore() {
      let value: Appearance = { ...defaultAppearance, theme: defaultTheme };
      try {
        const saved = localStorage.getItem(scope);
        value = normalizeAppearance(saved ? JSON.parse(saved) : scope === APPEARANCE_STORAGE_KEY ? { theme: localStorage.getItem('theme') ?? defaultTheme, accent: localStorage.getItem('tenh-accent') } : defaultAppearance);
      } catch { /* Use safe defaults when storage is blocked or invalid. */ }
      apply(value);
      setReady(true);
    }
    restore();
    const sync = (event: StorageEvent) => { if (event.key === scope || event.key === null) restore(); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [apply, defaultTheme, scope]);

  useEffect(() => {
    if (!enableSystem) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => {
      setSystemTheme(media.matches ? 'dark' : 'light');
      setResolvedTheme(applyAppearance(preferences, media.matches));
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [preferences, enableSystem]);

  const saveAppearance = useCallback((value: Appearance) => {
    const next = normalizeAppearance(value);
    // A single write commits the whole draft. If storage fails, leave the saved UI intact.
    localStorage.setItem(scope, JSON.stringify(next));
    apply(next);
  }, [apply, scope]);
  const value = useMemo(() => ({ ...preferences, ready, resolvedTheme, systemTheme, saveAppearance, setScope }), [preferences, ready, resolvedTheme, systemTheme, saveAppearance]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}
