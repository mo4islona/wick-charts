/** Parse-once color cache — hex colors come from theme config and don't change per-frame. */
const rgbaCache = new Map<string, string>();
const lightenCache = new Map<string, string>();
const darkenCache = new Map<string, string>();

function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba')) return hex.replace(/[\d.]+\)\s*$/, `${alpha})`);
  if (hex.startsWith('rgb(')) return hex.replace(/^rgb\((.*)\)$/i, `rgba($1, ${alpha})`);
  const key = hex + alpha;
  let result = rgbaCache.get(key);
  if (result) return result;
  const [r, g, b] = parseHex(hex);
  result = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  rgbaCache.set(key, result);
  return result;
}

export function lighten(hex: string, amount: number): string {
  const key = hex + amount;
  let result = lightenCache.get(key);
  if (result) return result;
  const [r, g, b] = parseHex(hex);
  result = toHex(
    Math.min(255, Math.round(r + (255 - r) * amount)),
    Math.min(255, Math.round(g + (255 - g) * amount)),
    Math.min(255, Math.round(b + (255 - b) * amount)),
  );
  lightenCache.set(key, result);
  return result;
}

export function darken(hex: string, amount: number): string {
  const key = hex + amount;
  let result = darkenCache.get(key);
  if (result) return result;
  const [r, g, b] = parseHex(hex);
  result = toHex(
    Math.max(0, Math.round(r * (1 - amount))),
    Math.max(0, Math.round(g * (1 - amount))),
    Math.max(0, Math.round(b * (1 - amount))),
  );
  darkenCache.set(key, result);
  return result;
}
