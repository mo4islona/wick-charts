// Mode, palette and URL helpers the React and Vue demo pages share; no framework code here.
import { BLOCKS, type BlockEntry, type Mode, PALETTES, type PaletteName } from './catalog';

export type ModeSetting = Mode | 'system';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

const MODE_KEY = 'wick-shadcn-demo-theme';

export const MODE_OPTIONS: { value: ModeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export const PALETTE_OPTIONS = (Object.keys(PALETTES) as PaletteName[]).map((name) => ({
  value: name,
  label: PALETTES[name].label,
}));

export function findBlock(name: string | null): BlockEntry | null {
  return BLOCKS.find((entry) => entry.name === name) ?? null;
}

export function isModeSetting(value: unknown): value is ModeSetting {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Storage can throw in a private window or a sandboxed frame; the mode then lasts one visit.
export function readStoredMode(): ModeSetting | null {
  try {
    const stored = localStorage.getItem(MODE_KEY);

    return isModeSetting(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeMode(mode: ModeSetting): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The choice is a convenience.
  }
}

/** Puts the mode class and the palette's `--chart-*` values on `<html>`, as a shadcn theme does. */
export function applyLook(mode: Mode, palette: PaletteName): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');

  const ramp = PALETTES[palette];
  const values = mode === 'dark' && ramp.dark.length > 0 ? ramp.dark : ramp.light;

  for (let i = 0; i < 5; i++) {
    const token = `--chart-${i + 1}`;
    const value = values[i];

    if (value === undefined) {
      root.style.removeProperty(token);
    } else {
      root.style.setProperty(token, `oklch(${value})`);
    }
  }
}

export function replaceQuery(updates: Record<string, string | null>): void {
  const url = new URL(window.location.href);

  for (const [name, value] of Object.entries(updates)) {
    if (value === null) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
  }

  window.history.replaceState(null, '', url);
}
