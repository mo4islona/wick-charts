import { describe, expect, it } from 'vitest';

import { type ChartCodeConfig, generateCode } from '../components/CodePreview';

// Representative config exercising every renamed symbol from Phase A:
// grid.visible, area.visible, entryAnimation, InfoBar (not TooltipLegend),
// strokeWidthPx, and stroke{widthPx} for pie.
const CONFIG: ChartCodeConfig = {
  theme: 'darkTheme',
  containerProps: {
    grid: { visible: true },
  },
  components: [
    {
      component: 'LineSeries',
      props: {
        data: 'data',
        options: {
          area: { visible: true },
          strokeWidthPx: 1.5,
          entryAnimation: 'grow',
        },
      },
    },
    {
      component: 'PieSeries',
      props: {
        data: 'data',
        options: { stroke: { color: '#000', widthPx: 2 } },
      },
    },
    { component: 'InfoBar' },
    { component: 'Crosshair' },
    { component: 'YAxis' },
  ],
};

const PRE_RENAME_SYMBOLS = [
  'TooltipLegend',
  'areaFill',
  'lineWidth',
  'enterAnimation',
  'enterMs',
  'candleGradient',
  // Legend mode 'solo' would appear only if Legend rendered with it, so skip.
];

describe('generateCode', () => {
  it('renders the React tab with renamed symbols', () => {
    const code = generateCode(CONFIG, 'react');

    expect(code).toContain("from '@wick-charts/react'");
    expect(code).toContain('<ChartContainer');
    expect(code).toContain('theme={darkTheme}');
    expect(code).toContain('grid={{ visible: true }}');
    expect(code).toContain('<LineSeries');
    expect(code).toContain('area: { visible: true }');
    expect(code).toContain('strokeWidthPx: 1.5');
    expect(code).toContain("entryAnimation: 'grow'");
    expect(code).toContain('<InfoBar');
    expect(code).toContain('<PieSeries');
    expect(code).toContain("stroke: { color: '#000', widthPx: 2 }");
  });

  it('renders the Vue tab with :-prefixed props and renamed symbols', () => {
    const code = generateCode(CONFIG, 'vue');

    expect(code).toContain('<script setup>');
    expect(code).toContain("from '@wick-charts/vue'");
    expect(code).toContain('<template>');
    expect(code).toContain(':theme="darkTheme"');
    expect(code).toContain(':grid=');
    expect(code).toContain('<InfoBar');
    expect(code).toContain('strokeWidthPx');
    expect(code).toContain('entryAnimation');
    expect(code).toContain('widthPx');
  });

  it('renders the Svelte tab with script block and renamed symbols', () => {
    const code = generateCode(CONFIG, 'svelte');

    expect(code).toContain('<script>');
    expect(code).toContain("from '@wick-charts/svelte'");
    expect(code).toContain('<ChartContainer');
    expect(code).toContain('<InfoBar');
    expect(code).toContain('strokeWidthPx');
    expect(code).toContain('entryAnimation');
  });

  it('leaks no pre-rename symbols across any framework', () => {
    for (const fw of ['react', 'vue', 'svelte'] as const) {
      const code = generateCode(CONFIG, fw);
      for (const pre of PRE_RENAME_SYMBOLS) {
        expect(code, `${fw} output should not contain '${pre}'`).not.toContain(pre);
      }
    }
  });
});
