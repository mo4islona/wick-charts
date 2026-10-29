// ── Types ────────────────────────────────────────────────────

interface PropObject {
  [key: string]: PropValue;
}
export type PropValue = string | number | boolean | undefined | PropValue[] | PropObject;

export interface ChartCodeChild {
  component: string;
  props?: Record<string, PropValue>;
  /**
   * Optional framework-indexed body content rendered between the component's
   * open and close tags — used for scoped-slot / render-prop demos in the
   * playground code panel. Falsy values render as self-closing.
   */
  childrenSnippet?: Partial<Record<Framework, string>>;
}

export interface ChartCodeTitle {
  text: string;
  sub?: string;
}

export interface ChartCodeConfig {
  components: ChartCodeChild[];
  /** The chart's `<Title>`, printed as the container's first child. */
  title?: ChartCodeTitle;
  theme?: string;
  /** Theme fields set on top of `theme`, by section: `{ grid: { style: 'dashed' } }`. */
  themeOverride?: Record<string, Record<string, PropValue>>;
  containerProps?: Record<string, PropValue>;
  /**
   * When `false`, components render at the top level without a
   * `<ChartContainer>` wrapper — for self-contained components like
   * `Sparkline` that manage their own container internally. `theme` (if set)
   * is then emitted as a prop on each component instead of on the container.
   * Default `true`.
   */
  container?: boolean;
  /** Vue and Svelte print `equivalent` instead, under `note` as a comment: the config uses a React-only component. */
  reactOnly?: { note: string; equivalent: ChartCodeConfig };
}

type Framework = 'react' | 'svelte' | 'vue';

const PACKAGES: Record<Framework, string> = {
  react: '@wick-charts/react',
  svelte: '@wick-charts/svelte',
  vue: '@wick-charts/vue',
};

// ── Code generation ──────────────────────────────────────────

function formatValue(v: PropValue, indent: number): string {
  if (typeof v === 'string') return isVarRef(v) ? v : `'${v}'`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => formatValue(x, indent)).join(', ')}]`;
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v).filter(([, val]) => val !== undefined);
    if (entries.length === 0) return '{}';

    const inline = entries.map(([k, val]) => `${k}: ${formatValue(val, indent)}`);
    // A multi-line value breaks its parent too, or the closing braces land out of line.
    const fitsOneLine = entries.length <= 2 && inline.every((part) => !part.includes('\n'));
    if (fitsOneLine) return `{ ${inline.join(', ')} }`;

    const pad = '  '.repeat(indent + 1);
    const closePad = '  '.repeat(indent);
    const inner = entries.map(([k, val]) => `${pad}${k}: ${formatValue(val, indent + 1)}`).join(',\n');
    return `{\n${inner},\n${closePad}}`;
  }
  return String(v);
}

// Allowlist of strings that should render as unquoted variable references in
// the generated snippet — e.g. `data={data}` rather than `data="data"`. Every
// other identifier-shaped string (e.g. enum values like 'bottom', 'both',
// 'grow', 'percent') stays quoted as a literal. Add new names here when a
// codeConfig introduces a genuine variable binding the caller would have in
// their host code.
const VAR_REF_NAMES = new Set([
  'accentColors',
  'asks',
  'bands',
  'bids',
  'catppuccin.theme.axis.textColor',
  'closePoints',
  'clusterUsage',
  'cpuLoad',
  'data',
  'data[0]',
  'divergingColors',
  'downColor',
  'errorBudget',
  'formatCount',
  'formatMs',
  'formatPercent',
  'formatSize',
  'formatSpend',
  'formatVisitors',
  'latencyP95',
  'ohlcData',
  'layers',
  'layers[0]',
  'links',
  'mean',
  'nodes',
  'planUsage',
  'pnl',
  'price',
  'releaseProgress',
  'sid',
  'series',
  'upColor',
  // Y-bound transition factory calls — rendered as bare identifiers so the
  // snippet shows `transition: spring()` not `transition: 'spring()'`.
  'hermite()',
  'spring()',
  'snap()',
  // Perf instrumentation factory — `perf={perfHud()}`.
  'perfHud()',
  // Log Y scale factory — `axis: { y: { scale: logScale() } }`.
  'logScale()',
]);

// Library exports a snippet references by value — rendered unquoted, with each
// callee added to the import list (`data={heikinAshi(ohlcData)}` imports `heikinAshi`).
const LIBRARY_REFS = new Map<string, string[]>([
  ['hollowCandle', ['hollowCandle']],
  ['ohlcBar', ['ohlcBar']],
  ['heikinAshi(ohlcData)', ['heikinAshi']],
  ['heroLayout()', ['heroLayout']],
  ['tickRing()', ['tickRing']],
  ['tickRing({ animation: radarTicks() })', ['tickRing', 'radarTicks']],
  ['tickRing({ animation: flyTicks() })', ['tickRing', 'flyTicks']],
  ['heroCenter()', ['heroCenter']],
  ['listCenter()', ['listCenter']],
  ['startLabels()', ['startLabels']],
  ['headTags()', ['headTags']],
]);

function isVarRef(v: PropValue): boolean {
  return typeof v === 'string' && (VAR_REF_NAMES.has(v) || LIBRARY_REFS.has(v));
}

function collectFactoryImports(value: PropValue | Record<string, PropValue>, imports: Set<string>): void {
  if (typeof value === 'string') {
    if (isVarRef(value) && value.endsWith('()')) imports.add(value.slice(0, -2));

    for (const name of LIBRARY_REFS.get(value) ?? []) {
      imports.add(name);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFactoryImports(item, imports);
    }

    return;
  }

  if (typeof value !== 'object' || value === null) return;

  for (const nested of Object.values(value)) {
    collectFactoryImports(nested, imports);
  }
}

/** Wrap threshold: if the one-liner component + props exceeds this, break
 * each prop onto its own line. Tuned to fit the playground's ~440px panel. */
const WRAP_AT = 60;

function renderPropPairs(props: Record<string, PropValue>, fw: Framework, indent: number): string[] {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined) continue;
    if (val === true) {
      parts.push(`${key}`);
    } else if (isVarRef(val)) {
      if (fw === 'vue') parts.push(`:${key}="${val}"`);
      else if (fw === 'svelte' && key === val) parts.push(`{${key}}`);
      else parts.push(`${key}={${val}}`);
    } else if (typeof val === 'string') {
      // JSX / Svelte string-attribute shorthand: render `position="bottom"`
      // rather than `position={'bottom'}`. Vue already uses literal attribute
      // form by default, so the `:`-prefix is skipped here.
      const escaped = val.replace(/"/g, '&quot;');
      if (fw === 'vue') parts.push(`${key}="${escaped}"`);
      else parts.push(`${key}="${escaped}"`);
    } else {
      const formatted = formatValue(val, indent);
      if (fw === 'vue') parts.push(`:${key}="${formatted.replace(/"/g, '&quot;')}"`);
      else parts.push(`${key}={${formatted}}`);
    }
  }
  return parts;
}

function renderChild(child: ChartCodeChild, fw: Framework, indent: number, leadingPairs: string[] = []): string {
  const pad = '  '.repeat(indent);
  // Wrapped props sit one level under the tag, and so do their multi-line values.
  const pairs = [...leadingPairs, ...(child.props ? renderPropPairs(child.props, fw, indent + 1) : [])];
  const multiLine = pairs.some((pair) => pair.includes('\n'));
  const body = child.childrenSnippet?.[fw];

  if (body) {
    const innerPad = '  '.repeat(indent + 1);
    const bodyText = body
      .split('\n')
      .map((line) => (line.length > 0 ? `${innerPad}${line}` : line))
      .join('\n');

    if (pairs.length === 0) return `${pad}<${child.component}>\n${bodyText}\n${pad}</${child.component}>`;

    const oneLine = `${pad}<${child.component} ${pairs.join(' ')}>`;
    if (!multiLine && oneLine.length <= WRAP_AT + pad.length) {
      return `${oneLine}\n${bodyText}\n${pad}</${child.component}>`;
    }
    const wrapped = pairs.map((p) => `${innerPad}${p}`).join('\n');

    return `${pad}<${child.component}\n${wrapped}\n${pad}>\n${bodyText}\n${pad}</${child.component}>`;
  }

  if (pairs.length === 0) return `${pad}<${child.component} />`;

  const oneLine = `${pad}<${child.component} ${pairs.join(' ')} />`;
  if (!multiLine && oneLine.length <= WRAP_AT + pad.length) return oneLine;

  const innerPad = '  '.repeat(indent + 1);
  const wrapped = pairs.map((p) => `${innerPad}${p}`).join('\n');

  return `${pad}<${child.component}\n${wrapped}\n${pad}/>`;
}

function wrapImport(importList: string[], pkg: string, leading: string): string {
  const oneLine = `${leading}import { ${importList.join(', ')} } from '${pkg}';`;
  if (oneLine.length <= WRAP_AT + 10) return oneLine;
  const inner = importList.map((s) => `${leading}  ${s},`).join('\n');
  return `${leading}import {\n${inner}\n${leading}} from '${pkg}';`;
}

function openChartContainer(themeAttr: string, containerPairs: string[]): string {
  const allPairs = [themeAttr, ...containerPairs].filter(Boolean);
  const inline = allPairs.length > 0 ? ` ${allPairs.join(' ')}` : '';
  const oneLine = `<ChartContainer${inline}>`;
  const multiLine = allPairs.some((pair) => pair.includes('\n'));
  if (!multiLine && oneLine.length <= WRAP_AT) return oneLine;

  return `<ChartContainer\n  ${allPairs.join('\n  ')}\n>`;
}

function importsOf(configs: ChartCodeConfig[]): string[] {
  const imports = new Set<string>();
  for (const config of configs) {
    if (config.container !== false) imports.add('ChartContainer');
    if (config.title) imports.add('Title');
    for (const child of config.components) imports.add(child.component);
    // Theme expressions can be a bare identifier (`catppuccin`) or a dotted
    // accessor (`catppuccin.theme` — what {@link createTheme} presets need to
    // hand the underlying ChartTheme to ChartContainer). Only the import root
    // belongs in the import list.
    if (config.theme) imports.add(config.theme.split('.')[0]);
    // Factory calls and library refs anywhere in the props (`perf={perfHud()}`,
    // `axis.y.scale: logScale()`, `candlePainter: hollowCandle`) import their callee.
    collectFactoryImports(config.containerProps ?? {}, imports);
    for (const child of config.components) {
      collectFactoryImports(child.props ?? {}, imports);
    }
  }

  return Array.from(imports).sort();
}

/** `theme`, spread with its {@link ChartCodeConfig.themeOverride} sections when there are any. */
function themeExpression(config: ChartCodeConfig): string | undefined {
  const root = config.theme;
  if (!root) return undefined;

  const sections = Object.entries(config.themeOverride ?? {});
  if (sections.length === 0) return root;

  const parts = sections.map(([section, fields]) => {
    const inner = Object.entries(fields)
      .map(([key, value]) => `${key}: ${formatValue(value, 0)}`)
      .join(', ');

    return `${section}: { ...${root}.${section}, ${inner} }`;
  });

  return `{ ...${root}, ${parts.join(', ')} }`;
}

/** One chart's markup at the top level, without imports. */
function chartMarkup(config: ChartCodeConfig, fw: Framework): string {
  const theme = themeExpression(config);
  const themeAttr = theme ? (fw === 'vue' ? `:theme="${theme}"` : `theme={${theme}}`) : '';

  // Self-contained components (e.g. Sparkline) render at the top level with no
  // ChartContainer wrapper. `theme` rides along as a prop on each component.
  if (config.container === false) {
    const themeLeading = themeAttr ? [themeAttr] : [];

    return config.components.map((c) => renderChild(c, fw, 0, themeLeading)).join('\n');
  }

  const containerPairs = config.containerProps ? renderPropPairs(config.containerProps, fw, 1) : [];
  const openTag = openChartContainer(themeAttr, containerPairs);
  const title = config.title ? [titleMarkup(config.title, fw)] : [];
  const children = [...title, ...config.components.map((c) => renderChild(c, fw, 1))].join('\n');

  return `${openTag}\n${children}\n</ChartContainer>`;
}

/** The container's `<Title>`. Vue and Svelte take the subtitle as the `sub` slot: their string prop is deprecated. */
function titleMarkup(title: ChartCodeTitle, fw: Framework): string {
  if (title.sub === undefined) return `  <Title>${title.text}</Title>`;

  if (fw === 'react') return `  <Title sub="${title.sub.replace(/"/g, '&quot;')}">${title.text}</Title>`;

  const subSlot =
    fw === 'vue'
      ? `<template #sub>${title.sub}</template>`
      : `<svelte:fragment slot="sub">${title.sub}</svelte:fragment>`;

  return `  <Title>\n    ${title.text}\n    ${subSlot}\n  </Title>`;
}

/** Indents every non-empty line by one level. */
function indentLines(text: string): string {
  return text.replace(/^(?=.)/gm, '  ');
}

/** The snippet of one chart, or of several charts under one import. */
export function generateCode(config: ChartCodeConfig | ChartCodeConfig[], fw: Framework): string {
  const requested = Array.isArray(config) ? config : [config];
  const configs = fw === 'react' ? requested : requested.map((c) => c.reactOnly?.equivalent ?? c);
  const importList = importsOf(configs);
  const pkg = PACKAGES[fw];
  const markup = configs.map((c) => chartMarkup(c, fw)).join('\n\n');

  if (fw === 'react') {
    const imp = wrapImport(importList, pkg, '');
    // JSX takes one root, so several charts go in a fragment.
    const body = configs.length > 1 ? `<>\n${indentLines(markup)}\n</>` : markup;

    return `${imp}\n\n${body}`;
  }

  const notes = new Set(requested.flatMap((c) => (c.reactOnly ? [c.reactOnly.note] : [])));
  const comments = [...notes].map((note) => `<!-- ${note} -->\n`).join('');

  if (fw === 'svelte') {
    const imp = wrapImport(importList, pkg, '  ');

    return `${comments}<script>\n${imp}\n</script>\n\n${markup}`;
  }

  const imp = wrapImport(importList, pkg, '');

  return `${comments}<script setup>\n${imp}\n</script>\n\n<template>\n${indentLines(markup)}\n</template>`;
}

export type { Framework };
