import type { CSSProperties } from "react";

function luminance(rgb: number[]) {
  const linear = rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function storefrontTheme(value: string | null | undefined): CSSProperties {
  const primary = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#2563eb";
  const rgb = [1, 3, 5].map(offset => parseInt(primary.slice(offset, offset + 2), 16));
  const light = luminance(rgb);
  // Bright colors use dark text. For other colors, deepen the fill only as much
  // as needed to give white labels at least 4.5:1 contrast.
  const bright = light > 0.45;
  let surface = primary;
  if (!bright && (1.05 / (light + 0.05)) < 4.5) {
    let shaded = rgb;
    for (let factor = 0.99; factor > 0; factor -= 0.01) {
      shaded = rgb.map(channel => Math.round(channel * factor));
      if (1.05 / (luminance(shaded) + 0.05) >= 4.5) break;
    }
    surface = `#${shaded.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return {
    "--store-primary": primary,
    "--store-primary-surface": surface,
    "--store-on-primary": bright ? "#13223d" : "#ffffff",
    "--store-primary-ink": light > 0.179 ? `color-mix(in srgb, ${primary} 45%, #13223d)` : primary,
  } as CSSProperties;
}
