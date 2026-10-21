// The registry blocks and the demo's URL / message contract, shared by the demo page and the
// docs guide that embeds it. No block code here, so the guide does not bundle the blocks.
import registry from '../../../registry/shadcn/registry.json';

export const REGISTRY_URL = 'https://wick-charts.eeff.io/r';
export const DEMO_PATH = '/demos/shadcn/';

export interface BlockEntry {
  /** Registry item name, e.g. `chart-candlestick`. */
  name: string;
  title: string;
  description: string;
  /** The component the block file exports, e.g. `ChartCandlestick`. */
  component: string;
  /** Takes a full row of the gallery grid. */
  wide: boolean;
}

const WIDE = new Set(['chart-order-book', 'chart-sparkline-cards', 'chart-line-navigator']);

function pascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export const BLOCKS: BlockEntry[] = registry.items
  .filter((item) => item.type === 'registry:block')
  .map((item) => ({
    name: item.name,
    title: item.title,
    description: item.description,
    component: pascalCase(item.name),
    wide: WIDE.has(item.name),
  }));

export function installCommand(name: string): string {
  return `npx shadcn@latest add ${REGISTRY_URL}/${name}.json`;
}

/** `--chart-1` … `--chart-5` ramps of shadcn themes, as OKLCH triplets. Neutral keeps the stylesheet's own. */
export const PALETTES = {
  neutral: { label: 'Neutral', light: [], dark: [] },
  blue: {
    label: 'Blue',
    light: [
      '0.809 0.105 251.813',
      '0.623 0.214 259.815',
      '0.546 0.245 262.881',
      '0.488 0.243 264.376',
      '0.424 0.199 265.638',
    ],
    dark: [],
  },
  emerald: {
    label: 'Emerald',
    light: [
      '0.845 0.143 164.978',
      '0.696 0.17 162.48',
      '0.596 0.145 163.225',
      '0.508 0.118 165.612',
      '0.432 0.095 166.913',
    ],
    dark: [],
  },
  orange: {
    label: 'Orange',
    light: ['0.837 0.128 66.29', '0.705 0.213 47.604', '0.646 0.222 41.116', '0.553 0.195 38.402', '0.47 0.157 37.304'],
    dark: [],
  },
  // The multi-hue ramp of shadcn themes before the one-hue ones; it differs per mode.
  legacy: {
    label: 'Legacy',
    light: ['0.646 0.222 41.116', '0.6 0.118 184.704', '0.398 0.07 227.392', '0.828 0.189 84.429', '0.769 0.188 70.08'],
    dark: ['0.488 0.243 264.376', '0.696 0.17 162.48', '0.769 0.188 70.08', '0.627 0.265 303.9', '0.645 0.246 16.439'],
  },
} satisfies Record<string, { label: string; light: string[]; dark: string[] }>;

export type PaletteName = keyof typeof PALETTES;
export type Mode = 'light' | 'dark';

export function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === 'string' && Object.hasOwn(PALETTES, value);
}

/** What the guide sends the embedded demo, so a change applies without a reload. */
export interface DemoMessage {
  type: 'wick-shadcn-demo';
  block: string;
  mode: Mode;
  palette: PaletteName;
}

export function isDemoMessage(value: unknown): value is DemoMessage {
  if (typeof value !== 'object' || value === null) return false;

  const message = value as Record<string, unknown>;
  const validMode = message.mode === 'light' || message.mode === 'dark';

  return (
    message.type === 'wick-shadcn-demo' &&
    typeof message.block === 'string' &&
    validMode &&
    isPaletteName(message.palette)
  );
}

export interface DemoUrlOptions {
  block?: string;
  mode?: Mode;
  palette?: PaletteName;
  embed?: boolean;
}

export function demoUrl({ block, mode, palette, embed = false }: DemoUrlOptions): string {
  const params = new URLSearchParams();
  if (block) params.set('block', block);
  if (mode) params.set('theme', mode);
  if (palette && palette !== 'neutral') params.set('palette', palette);
  if (embed) params.set('embed', '');

  const query = params.toString();

  return query ? `${DEMO_PATH}?${query}` : DEMO_PATH;
}
