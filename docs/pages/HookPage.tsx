// Hook documentation. Hooks aren't in the auto-generated manifest (the
// extractor walks prop interfaces, not function signatures) — they're
// hand-authored here. Each hook has a single shared description but
// per-framework name / signature / example so a Vue or Svelte reader sees
// the right import and call shape.
//
// Routes stay React-named (`hooks/use-chart-instance`) so deep links remain
// stable when a user switches the framework selector — only the visible
// label, signature, and example change.

import type { ChartTheme } from '@wick-charts/react';

import { Markdown } from '../components/Markdown';
import { HighlightedCode } from '../components/playground/CodeView';
import { type Framework, useFramework } from '../context/framework';
import { FRAMEWORK_META, HOOK_NAMES, getHookName } from './api/frameworks';

interface FrameworkHook {
  name: string;
  signature: string;
  example?: string;
}

interface HookEntry {
  /** Shared across frameworks; only names + signatures + examples differ. */
  description: string;
  react: FrameworkHook;
  vue: FrameworkHook;
  svelte: FrameworkHook;
}

const HOOKS: Record<string, HookEntry> = {
  useChartInstance: {
    description:
      'Returns the underlying `ChartInstance` for the surrounding `<ChartContainer>`. Use this to call imperative methods (e.g. `addLineSeries`, `setSeriesData`, `resetZoom`) from inside child components. Must be called from a component rendered inside a `<ChartContainer>` — calling it outside throws.',
    react: {
      name: 'useChartInstance',
      signature: '() => ChartInstance',
      example: `import { useChartInstance } from '@wick-charts/react';

function ResetButton() {
  const chart = useChartInstance();

  return <button onClick={() => chart.resetZoom()}>Reset</button>;
}`,
    },
    vue: {
      name: 'useChartInstance',
      signature: '() => ChartInstance',
      example: `<script setup lang="ts">
import { useChartInstance } from '@wick-charts/vue';

const chart = useChartInstance();
</script>

<template>
  <button @click="chart.resetZoom()">Reset</button>
</template>`,
    },
    svelte: {
      name: 'getChartContext',
      signature: '() => Readable<ChartInstance>',
      example: `<script lang="ts">
  import { getChartContext } from '@wick-charts/svelte';

  const chart = getChartContext();
</script>

<button on:click={() => $chart.resetZoom()}>Reset</button>`,
    },
  },

  useTheme: {
    description:
      'Reads the current `ChartTheme` from the surrounding theme context. Use this when authoring custom render-props / slots (Tooltip, InfoBar, Legend) so your overlay matches the active theme.',
    react: {
      name: 'useTheme',
      signature: '() => ChartTheme',
      example: `import { useTheme } from '@wick-charts/react';

function MyOverlay() {
  const theme = useTheme();

  return <div style={{ background: theme.tooltip.background }}>…</div>;
}`,
    },
    vue: {
      name: 'useTheme',
      signature: '() => ChartTheme',
      example: `<script setup lang="ts">
import { useTheme } from '@wick-charts/vue';

const theme = useTheme();
</script>

<template>
  <div :style="{ background: theme.tooltip.background }">…</div>
</template>`,
    },
    svelte: {
      name: 'getThemeContext',
      signature: '() => Readable<ChartTheme>',
      example: `<script lang="ts">
  import { getThemeContext } from '@wick-charts/svelte';

  const theme = getThemeContext();
</script>

<div style="background: {$theme.tooltip.background}">…</div>`,
    },
  },

  useCrosshairPosition: {
    description:
      'Subscribes to crosshair updates. Returns `{ time, x, y, distance }` while the user is hovering the chart, or `null` when no hover is active. Re-renders only when the crosshair changes — safe to use in heavy custom overlays.',
    react: {
      name: 'useCrosshairPosition',
      signature: '(chart: ChartInstance) => CrosshairPosition | null',
    },
    vue: {
      name: 'useCrosshairPosition',
      signature: '(chart: ChartInstance) => Ref<CrosshairPosition | null>',
    },
    svelte: {
      name: 'createCrosshairPosition',
      signature: '(chart: ChartInstance) => Readable<CrosshairPosition | null>',
    },
  },

  useLastYValue: {
    description:
      'Reactive snapshot of the most-recent Y value for a series. Tracks the smoothed value used by `<YLabel>`, so values animate consistently with the price badge.',
    react: { name: 'useLastYValue', signature: '(chart: ChartInstance, seriesId: string) => number | null' },
    vue: { name: 'useLastYValue', signature: '(chart: ChartInstance, seriesId: string) => Ref<number | null>' },
    svelte: {
      name: 'createLastYValue',
      signature: '(chart: ChartInstance, seriesId: string) => Readable<number | null>',
    },
  },

  usePreviousClose: {
    description:
      'Returns the previous-session close for a series, when one is set on the chart. Useful for building custom "% change" overlays that match the built-in `<InfoBar>`.',
    react: { name: 'usePreviousClose', signature: '(chart: ChartInstance, seriesId: string) => number | null' },
    vue: { name: 'usePreviousClose', signature: '(chart: ChartInstance, seriesId: string) => Ref<number | null>' },
    svelte: {
      name: 'createPreviousClose',
      signature: '(chart: ChartInstance, seriesId: string) => Readable<number | null>',
    },
  },

  useVisibleRange: {
    description:
      "Subscribes to viewport changes. Returns the visible time range `{ start, end }` of the chart. Use this to drive secondary visualisations (mini-maps, range-aware fetchers) that should track the user's pan/zoom.",
    react: { name: 'useVisibleRange', signature: '(chart: ChartInstance) => VisibleRange' },
    vue: { name: 'useVisibleRange', signature: '(chart: ChartInstance) => Ref<VisibleRange>' },
    svelte: { name: 'createVisibleRange', signature: '(chart: ChartInstance) => Readable<VisibleRange>' },
  },

  useYRange: {
    description:
      'Subscribes to Y-axis range changes. Returns the current `{ min, max }` derived from visible data plus padding. Re-renders on every viewport recompute.',
    react: { name: 'useYRange', signature: '(chart: ChartInstance) => YRange' },
    vue: { name: 'useYRange', signature: '(chart: ChartInstance) => Ref<YRange>' },
    svelte: { name: 'createYRange', signature: '(chart: ChartInstance) => Readable<YRange>' },
  },
};

export function HookPage({ hookKey, theme }: { hookKey: string; theme: ChartTheme }) {
  const entry = HOOKS[hookKey];
  const [fw] = useFramework();

  if (!entry) {
    return (
      <div style={{ padding: 24, color: theme.tooltip.textColor }}>
        Hook <code>{hookKey}</code> not documented yet.
      </div>
    );
  }

  const variant = entry[fw];
  const equivalents = buildEquivalentsLine(hookKey, fw);

  return (
    <div style={{ padding: '8px 20px 40px', maxWidth: 1080 }}>
      <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>{variant.name}</h2>

      <pre
        className="pg-code"
        style={{
          padding: '8px 12px',
          margin: '12px 0 12px',
          fontSize: 12,
          background: 'var(--code-bg, rgba(0,0,0,0.04))',
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 6,
          color: theme.tooltip.textColor,
        }}
      >
        <code>{`${variant.name}: ${variant.signature}`}</code>
      </pre>

      <div style={{ fontSize: 12, color: theme.axis.textColor, opacity: 0.75, marginBottom: 12 }}>
        Imported from <code className="md-inline-code">{FRAMEWORK_META[fw].pkg}</code>
        {equivalents && <> · {equivalents}</>}
      </div>

      <Markdown source={entry.description} theme={theme} />

      {variant.example && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 8px', letterSpacing: '-0.01em' }}>Example</h3>
          <div style={{ marginTop: 8 }}>
            <HighlightedCode code={variant.example} theme={theme} label={FRAMEWORK_META[fw].label} />
          </div>
        </>
      )}
    </div>
  );
}

/** Returns the "Equivalent in other frameworks: …" trailer when names diverge. */
function buildEquivalentsLine(hookKey: string, fw: Framework): string {
  const renames = HOOK_NAMES[hookKey];
  if (!renames) return '';

  const others = (['react', 'vue', 'svelte'] as Framework[])
    .filter((other) => other !== fw)
    .map((other) => ({ fw: other, name: getHookName(hookKey, other) }))
    .filter(({ name }) => name !== renames[fw]);

  if (others.length === 0) return '';

  const parts = others.map(({ fw: other, name }) => `${FRAMEWORK_META[other].label}: ${name}`);

  return `Equivalent → ${parts.join(', ')}`;
}
