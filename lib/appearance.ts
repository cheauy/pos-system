export const APPEARANCE_STORAGE_KEY = 'tenh-appearance';
export const accentColors = { white: '#ffffff', navy: '#01204e', teal: '#028391', sand: '#f6dcac', peach: '#faa968', orange: '#f85525' } as const;
export const accentTextColors = { white: '#01204e', navy: '#ffffff', teal: '#ffffff', sand: '#01204e', peach: '#01204e', orange: '#01204e' } as const;
const actionColors = { white: '#2563eb', navy: '#01204e', teal: '#006b76', sand: '#725018', peach: '#93430b', orange: '#b92e08' } as const;
export type ThemeValue = 'system' | 'light' | 'dark';
export type AccentColor = keyof typeof accentColors | 'custom';
export type Appearance = {
  theme: ThemeValue;
  accent: AccentColor;
  customColor: string;
  textSize: 'small' | 'medium' | 'large';
  density: 'compact' | 'comfortable';
  highContrast: boolean;
};
export const defaultAppearance: Appearance = { theme: 'system', accent: 'white', customColor: '#028391', textSize: 'medium', density: 'comfortable', highContrast: false };

export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? value as Partial<Appearance> : {};
  return {
    theme: input.theme === 'light' || input.theme === 'dark' ? input.theme : 'system',
    accent: input.accent === 'custom' || (typeof input.accent === 'string' && Object.hasOwn(accentColors, input.accent)) ? input.accent : 'white',
    customColor: typeof input.customColor === 'string' && /^#[\da-f]{6}$/i.test(input.customColor) ? input.customColor.toLowerCase() : defaultAppearance.customColor,
    textSize: input.textSize === 'small' || input.textSize === 'large' ? input.textSize : 'medium',
    density: input.density === 'compact' ? 'compact' : 'comfortable',
    highContrast: input.highContrast === true,
  };
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function appearancePalette(value: Appearance, resolvedTheme = value.theme) {
  if (resolvedTheme === 'dark') return { background: '#0f172a', foreground: '#e2e8f0', action: '#2563eb' };
  const background = value.accent === 'custom' ? value.customColor : accentColors[value.accent];
  if (value.accent !== 'custom') return { background, foreground: accentTextColors[value.accent], action: actionColors[value.accent] };
  const foreground = luminance(background) > 0.179 ? '#000000' : '#ffffff';
  let action = background;
  // Keep white button labels readable even when the selected color is very light.
  while (1.05 / (luminance(action) + 0.05) < 4.5) {
    action = '#' + [1, 3, 5].map(offset => Math.floor(parseInt(action.slice(offset, offset + 2), 16) * 0.9).toString(16).padStart(2, '0')).join('');
  }
  return { background, foreground, action };
}
