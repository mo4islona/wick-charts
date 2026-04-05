import { useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { HighlightedCode, ToggleGroup } from './controls';

// ── Types ────────────────────────────────────────────────────

export interface ChartCodeChild {
  component: string;
  props?: Record<string, any>;
}

export interface ChartCodeConfig {
  components: ChartCodeChild[];
  theme?: string;
  containerProps?: Record<string, any>;
}

type Framework = 'react' | 'svelte' | 'vue';

const PACKAGES: Record<Framework, string> = {
  react: '@wick-charts/react',
  svelte: '@wick-charts/svelte',
  vue: '@wick-charts/vue',
};

// ── Code generation ──────────────────────────────────────────

function formatValue(v: any, indent: number): string {
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

function isVarRef(v: any): boolean {
  return typeof v === 'string' && /^[a-zA-Z_$][\w$.]*$/.test(v) && !v.includes(' ');
}

function renderProps(props: Record<string, any>, fw: Framework, indent: number): string {
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
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function renderChild(child: ChartCodeChild, fw: Framework, indent: number): string {
  const pad = '  '.repeat(indent);
  const propsStr = child.props ? renderProps(child.props, fw, indent) : '';
  return `${pad}<${child.component}${propsStr} />`;
}

function generateCode(config: ChartCodeConfig, fw: Framework): string {
  const imports = new Set<string>(['ChartContainer']);
  for (const child of config.components) imports.add(child.component);
  if (config.theme) imports.add(config.theme);

  const importList = Array.from(imports).sort().join(', ');
  const pkg = PACKAGES[fw];

  const containerProps = config.containerProps ? renderProps(config.containerProps, fw, 0) : '';
  const themeStr = config.theme ? (fw === 'vue' ? ` :theme="${config.theme}"` : ` theme={${config.theme}}`) : '';

  const children = config.components.map((c) => renderChild(c, fw, 2)).join('\n');

  if (fw === 'react') {
    return `import { ${importList} } from '${pkg}';

<ChartContainer${themeStr}${containerProps}>
${children}
</ChartContainer>`;
  }

  if (fw === 'svelte') {
    return `<script>
  import { ${importList} } from '${pkg}';
</script>

<ChartContainer${themeStr}${containerProps}>
${children}
</ChartContainer>`;
  }

  // vue
  return `<script setup>
import { ${importList} } from '${pkg}';
</script>

<template>
  <ChartContainer${themeStr}${containerProps}>
${children.replace(/^/gm, '  ')}
  </ChartContainer>
</template>`;
}

// ── Component ────────────────────────────────────────────────

export function CodePreview({ config, theme }: { config: ChartCodeConfig; theme: ChartTheme }) {
  const [fw, setFw] = useState<Framework>('react');

  const code = generateCode(config, fw);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <ToggleGroup
        label=""
        options={[
          { value: 'react', label: 'React' },
          { value: 'svelte', label: 'Svelte' },
          { value: 'vue', label: 'Vue' },
        ]}
        value={fw}
        onChange={(v) => setFw(v as Framework)}
        theme={theme}
      />
      <HighlightedCode code={code} theme={theme} />
    </div>
  );
}
