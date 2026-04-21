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

export interface ChartCodeConfig {
  components: ChartCodeChild[];
  theme?: string;
  containerProps?: Record<string, PropValue>;
}

type Framework = 'react' | 'svelte' | 'vue';

const PACKAGES: Record<Framework, string> = {
  react: '@wick-charts/react',
  svelte: '@wick-charts/svelte',
  vue: '@wick-charts/vue',
};

// ── Code generation ──────────────────────────────────────────

function formatValue(v: PropValue, indent: number): string {
  if (typeof v === 'string') return `'${v}'`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => formatValue(x, indent)).join(', ')}]`;
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v).filter(([, val]) => val !== undefined);
    if (entries.length === 0) return '{}';
    if (entries.length <= 2) {
      const inner = entries.map(([k, val]) => `${k}: ${formatValue(val, indent)}`).join(', ');
      return `{ ${inner} }`;
    }
    const pad = '  '.repeat(indent + 1);
    const closePad = '  '.repeat(indent);
    const inner = entries.map(([k, val]) => `${pad}${k}: ${formatValue(val, indent + 1)}`).join(',\n');
    return `{\n${inner},\n${closePad}}`;
  }
  return String(v);
}

function isVarRef(v: PropValue): boolean {
  return typeof v === 'string' && /^[a-zA-Z_$][\w$.]*$/.test(v) && !v.includes(' ');
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
    } else {
      const formatted = formatValue(val, indent);
      if (fw === 'vue') parts.push(`:${key}="${formatted.replace(/'/g, "\\'")}"`);
      else parts.push(`${key}={${formatted}}`);
    }
  }
  return parts;
}

function renderChild(child: ChartCodeChild, fw: Framework, indent: number): string {
  const pad = '  '.repeat(indent);
  const pairs = child.props ? renderPropPairs(child.props, fw, indent) : [];
  const body = child.childrenSnippet?.[fw];

  if (body) {
    const innerPad = '  '.repeat(indent + 1);
    const bodyText = body
      .split('\n')
      .map((line) => (line.length > 0 ? `${innerPad}${line}` : line))
      .join('\n');

    if (pairs.length === 0) return `${pad}<${child.component}>\n${bodyText}\n${pad}</${child.component}>`;

    const oneLine = `${pad}<${child.component} ${pairs.join(' ')}>`;
    if (oneLine.length <= WRAP_AT + pad.length) {
      return `${oneLine}\n${bodyText}\n${pad}</${child.component}>`;
    }
    const wrapped = pairs.map((p) => `${innerPad}${p}`).join('\n');

    return `${pad}<${child.component}\n${wrapped}\n${pad}>\n${bodyText}\n${pad}</${child.component}>`;
  }

  if (pairs.length === 0) return `${pad}<${child.component} />`;

  const oneLine = `${pad}<${child.component} ${pairs.join(' ')} />`;
  if (oneLine.length <= WRAP_AT + pad.length) return oneLine;

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
  if (oneLine.length <= WRAP_AT) return oneLine;

  return `<ChartContainer\n  ${allPairs.join('\n  ')}\n>`;
}

export function generateCode(config: ChartCodeConfig, fw: Framework): string {
  const imports = new Set<string>(['ChartContainer']);
  for (const child of config.components) imports.add(child.component);
  if (config.theme) imports.add(config.theme);

  const importList = Array.from(imports).sort();
  const pkg = PACKAGES[fw];

  const containerPairs = config.containerProps ? renderPropPairs(config.containerProps, fw, 0) : [];
  const themeAttr = config.theme ? (fw === 'vue' ? `:theme="${config.theme}"` : `theme={${config.theme}}`) : '';

  const openTag = openChartContainer(themeAttr, containerPairs);
  const children = config.components.map((c) => renderChild(c, fw, 1)).join('\n');

  if (fw === 'react') {
    const imp = wrapImport(importList, pkg, '');
    return `${imp}\n\n${openTag}\n${children}\n</ChartContainer>`;
  }

  if (fw === 'svelte') {
    const imp = wrapImport(importList, pkg, '  ');
    return `<script>\n${imp}\n</script>\n\n${openTag}\n${children}\n</ChartContainer>`;
  }

  // vue — indent the container block two spaces inside <template>
  const imp = wrapImport(importList, pkg, '');
  const tmplOpen = openTag.replace(/^/gm, '  ');
  const tmplChildren = children.replace(/^/gm, '  ');
  return `<script setup>\n${imp}\n</script>\n\n<template>\n${tmplOpen}\n${tmplChildren}\n  </ChartContainer>\n</template>`;
}

export type { Framework };
