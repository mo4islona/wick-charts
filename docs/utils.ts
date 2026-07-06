export function darken(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color;
  if (!color.startsWith('#')) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Raise a hex color's HSL saturation to at least `min` (0..1), keeping hue
 * and lightness. Low-alpha washes of muted theme accents read as plain gray;
 * boosting saturation first keeps the hue visible through the transparency.
 */
export function saturate(hex: string, min: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const l = (max + minC) / 2;
  const d = max - minC;

  if (d === 0) return hex;

  const s = l > 0.5 ? d / (2 - max - minC) : d / (max + minC);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  const s2 = Math.max(s, min);
  if (s2 === s) return hex;

  const q = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let t2 = t;
    if (t2 < 0) t2 += 1;
    if (t2 > 1) t2 -= 1;
    if (t2 < 1 / 6) return p + (q - p) * 6 * t2;
    if (t2 < 1 / 2) return q;
    if (t2 < 2 / 3) return p + (q - p) * (2 / 3 - t2) * 6;

    return p;
  };

  const toHex = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(channel(h + 1 / 3))}${toHex(channel(h))}${toHex(channel(h - 1 / 3))}`;
}

/** BT.601 luma — matches createTheme's isDarkBg but works on runtime hex
 *  colors. Non-hex values read as dark (the safer default for overlays). */
export function isDarkColor(hex: string): boolean {
  if (!hex.startsWith('#') || hex.length < 7) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * The blueprint grid drawn behind the page — a coarse 130px lattice with a
 * fine 26px one inside it. Shared by the App page background and the Sidebar
 * (which fades it out with a mask) so the two stay on the same grid.
 */
export function gridBackgroundImage(dark: boolean): string {
  const major = dark ? 0.06 : 0.12;
  const minor = dark ? 0.03 : 0.06;

  return [
    `repeating-linear-gradient(0deg, transparent, transparent 129px, rgba(150,150,150,${major}) 129px, rgba(150,150,150,${major}) 130px)`,
    `repeating-linear-gradient(90deg, transparent, transparent 129px, rgba(150,150,150,${major}) 129px, rgba(150,150,150,${major}) 130px)`,
    `repeating-linear-gradient(0deg, transparent, transparent 25px, rgba(150,150,150,${minor}) 25px, rgba(150,150,150,${minor}) 26px)`,
    `repeating-linear-gradient(90deg, transparent, transparent 25px, rgba(150,150,150,${minor}) 25px, rgba(150,150,150,${minor}) 26px)`,
  ].join(', ');
}

/**
 * Per-theme font-size override for docs UI surfaces only (sidebar, markdown,
 * ApiTable, etc.). Charts read `theme.typography.fontSize` directly and stay
 * at whatever the theme set — this helper only affects the documentation
 * chrome.
 *
 * Caveat (Handwritten theme) has thin strokes that read ~30 % smaller
 * perceptually than monospace at the same px size. The theme keeps Caveat
 * at 15 px so chart-internal Title/InfoBar don't look oversized; the docs
 * bump it for legibility. Detected by font-family rather than theme name
 * because `ChartTheme` carries no name field.
 */
export function docFontSize(theme: { typography: { fontSize: number; fontFamily: string } }): number {
  if (theme.typography.fontFamily.includes('Caveat')) return theme.typography.fontSize + 4;

  return theme.typography.fontSize;
}
