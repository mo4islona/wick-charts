import { describe, expect, it } from 'vitest';

import { type ChartCodeConfig, generateCode } from '../components/CodePreview';

// Representative config exercising every renamed symbol from Phase A:
// grid.visible, area.visible, entryAnimation, InfoBar,
// strokeWidth, and stroke{width} for pie.
const CONFIG: ChartCodeConfig = {
  theme: 'catppuccin.theme',
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
          strokeWidth: 1.5,
          entryAnimation: 'grow',
        },
      },
    },
    {
      component: 'PieSeries',
      props: {
        data: 'data',
        options: { stroke: { color: '#000', width: 2 } },
      },
    },
    { component: 'InfoBar' },
    { component: 'Crosshair' },
    { component: 'YAxis' },
  ],
};

const PRE_RENAME_SYMBOLS = [
  'areaFill',
  'lineWidth',
  'enterAnimation',
  'enterMs',
  // Legend mode 'solo' would appear only if Legend rendered with it, so skip.
];

describe('generateCode', () => {
  it('renders the React tab with renamed symbols', () => {
    const code = generateCode(CONFIG, 'react');

    expect(code).toContain("from '@wick-charts/react'");
    expect(code).toContain('<ChartContainer');
    expect(code).toContain('theme={catppuccin.theme}');
    expect(code).toContain('grid={{ visible: true }}');
    expect(code).toContain('<LineSeries');
    expect(code).toContain('area: { visible: true }');
    expect(code).toContain('strokeWidth: 1.5');
    expect(code).toContain("entryAnimation: 'grow'");
    expect(code).toContain('<InfoBar');
    expect(code).toContain('<PieSeries');
    expect(code).toContain("stroke: { color: '#000', width: 2 }");
  });

  it('renders the Vue tab with :-prefixed props and renamed symbols', () => {
    const code = generateCode(CONFIG, 'vue');

    expect(code).toContain('<script setup>');
    expect(code).toContain("from '@wick-charts/vue'");
    expect(code).toContain('<template>');
    expect(code).toContain(':theme="catppuccin.theme"');
    expect(code).toContain(':grid=');
    expect(code).toContain('<InfoBar');
    expect(code).toContain('strokeWidth');
    expect(code).toContain('entryAnimation');
    expect(code).toContain('width');
  });

  it('renders the Svelte tab with script block and renamed symbols', () => {
    const code = generateCode(CONFIG, 'svelte');

    expect(code).toContain('<script>');
    expect(code).toContain("from '@wick-charts/svelte'");
    expect(code).toContain('<ChartContainer');
    expect(code).toContain('<InfoBar');
    expect(code).toContain('strokeWidth');
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

  it('renders top-level string props as plain attributes (Legend position / InfoBar sort)', () => {
    const config: ChartCodeConfig = {
      components: [
        { component: 'InfoBar', props: { sort: 'desc' } },
        { component: 'Legend', props: { position: 'right', mode: 'isolate' } },
      ],
    };

    const react = generateCode(config, 'react');
    expect(react).toContain('<InfoBar sort="desc" />');
    expect(react).toContain('<Legend position="right" mode="isolate" />');

    const vue = generateCode(config, 'vue');
    expect(vue).toContain('sort="desc"');
    expect(vue).toContain('position="right"');
  });

  it('keeps plain single quotes for strings inside a Vue object prop', () => {
    const config: ChartCodeConfig = {
      components: [{ component: 'GaugeSeries', props: { options: { label: 'CPU load' } } }],
    };

    const vue = generateCode(config, 'vue');
    expect(vue).toContain(`:options="{ label: 'CPU load' }"`);
    expect(vue).not.toContain("\\'");
  });

  describe('childrenSnippet (slot / render-prop body)', () => {
    const SNIPPET_CONFIG: ChartCodeConfig = {
      components: [
        {
          component: 'Tooltip',
          childrenSnippet: {
            react: `{({ snapshots }) => (
  <pre>{JSON.stringify(snapshots)}</pre>
)}`,
            vue: `<template #default="{ snapshots }">
  <pre>{{ snapshots }}</pre>
</template>`,
            svelte: `<svelte:fragment let:snapshots>
  <pre>{JSON.stringify(snapshots)}</pre>
</svelte:fragment>`,
          },
        },
      ],
    };

    it('emits open+close tags with indented body in React', () => {
      const code = generateCode(SNIPPET_CONFIG, 'react');

      expect(code).toContain('<Tooltip>');
      expect(code).toContain('</Tooltip>');
      expect(code).not.toMatch(/<Tooltip[^>]*\/>/);
      expect(code).toContain('    {({ snapshots }) => (');
      expect(code).toContain('      <pre>{JSON.stringify(snapshots)}</pre>');
    });

    it('emits open+close tags with indented body in Vue', () => {
      const code = generateCode(SNIPPET_CONFIG, 'vue');

      expect(code).toContain('<Tooltip>');
      expect(code).toContain('</Tooltip>');
      expect(code).toContain('<template #default="{ snapshots }">');
    });

    it('emits open+close tags with indented body in Svelte', () => {
      const code = generateCode(SNIPPET_CONFIG, 'svelte');

      expect(code).toContain('<Tooltip>');
      expect(code).toContain('</Tooltip>');
      expect(code).toContain('<svelte:fragment let:snapshots>');
      expect(code).toContain('</svelte:fragment>');
    });

    it('falls back to self-closing when the snippet is missing for a framework', () => {
      const partial: ChartCodeConfig = {
        components: [
          {
            component: 'Tooltip',
            childrenSnippet: { react: `{({ snapshots }) => null}` },
          },
        ],
      };

      expect(generateCode(partial, 'react')).toMatch(/<Tooltip>[\s\S]*<\/Tooltip>/);
      expect(generateCode(partial, 'vue')).toContain('<Tooltip />');
      expect(generateCode(partial, 'svelte')).toContain('<Tooltip />');
    });
  });

  describe('standalone (container: false)', () => {
    // Self-contained components like Sparkline render with no <ChartContainer>
    // wrapper; theme rides along as a prop on each component instead.
    const STANDALONE_CONFIG: ChartCodeConfig = {
      theme: 'catppuccin.theme',
      container: false,
      components: [
        {
          component: 'Sparkline',
          props: { data: 'data', variant: 'bar', flow: { capacity: 80 } },
        },
      ],
    };

    it('omits the ChartContainer wrapper and passes theme as a prop in React', () => {
      const code = generateCode(STANDALONE_CONFIG, 'react');

      expect(code).not.toContain('ChartContainer');
      expect(code).toContain("import { Sparkline, catppuccin } from '@wick-charts/react';");
      expect(code).toContain('theme={catppuccin.theme}');
      expect(code).toContain('data={data}');
      expect(code).toContain('variant="bar"');
      expect(code).toContain('flow={{ capacity: 80 }}');
    });

    it('passes theme as a :-prefixed prop and skips the container in Vue', () => {
      const code = generateCode(STANDALONE_CONFIG, 'vue');

      expect(code).not.toContain('ChartContainer');
      expect(code).toContain('<template>');
      expect(code).toContain(':theme="catppuccin.theme"');
      expect(code).toContain('<Sparkline');
    });

    it('passes theme as a prop and skips the container in Svelte', () => {
      const code = generateCode(STANDALONE_CONFIG, 'svelte');

      expect(code).not.toContain('ChartContainer');
      expect(code).toContain('<script>');
      expect(code).toContain('theme={catppuccin.theme}');
    });
  });

  it('imports factory calls nested inside container props', () => {
    const code = generateCode(
      {
        theme: 'catppuccin.theme',
        containerProps: {
          axis: { y: { scale: 'logScale()' } },
          animations: { axis: { y: { curve: 'spring()' } } },
        },
        components: [{ component: 'LineSeries', props: { data: 'data' } }],
      },
      'react',
    );

    expect(code).toContain('scale: logScale()');
    expect(code).toMatch(/import \{[^}]*\blogScale\b[^}]*\} from '@wick-charts\/react';/);
    expect(code).toMatch(/import \{[^}]*\bspring\b[^}]*\} from '@wick-charts\/react';/);
  });

  it('imports library refs used by value in component props', () => {
    const code = generateCode(
      {
        components: [
          {
            component: 'CandlestickSeries',
            props: { data: 'heikinAshi(ohlcData)', options: { candlePainter: 'hollowCandle' } },
          },
        ],
      },
      'react',
    );

    expect(code).toContain('data={heikinAshi(ohlcData)}');
    expect(code).toContain('candlePainter: hollowCandle');
    expect(code).toMatch(/import \{[^}]*\bheikinAshi\b[^}]*\} from '@wick-charts\/react';/);
    expect(code).toMatch(/import \{[^}]*\bhollowCandle\b[^}]*\} from '@wick-charts\/react';/);
    expect(code).not.toMatch(/import \{[^}]*\bohlcData\b/);
  });

  it('imports every function of a nested library call', () => {
    const code = generateCode(
      {
        components: [
          {
            component: 'RadialProgressSeries',
            props: { data: 'data', options: { painter: 'tickRing({ animation: radarTicks() })' } },
          },
        ],
      },
      'react',
    );

    expect(code).toContain('painter: tickRing({ animation: radarTicks() })');
    expect(code).toMatch(/import \{[^}]*\btickRing\b[^}]*\} from '@wick-charts\/react';/);
    expect(code).toMatch(/import \{[^}]*\bradarTicks\b[^}]*\} from '@wick-charts\/react';/);
  });

  describe('several charts in one snippet', () => {
    const CHARTS: ChartCodeConfig[] = [
      { theme: 'catppuccin.theme', components: [{ component: 'GaugeSeries', props: { value: 'cpuLoad' } }] },
      {
        theme: 'catppuccin.theme',
        components: [
          { component: 'RadialProgressSeries', props: { data: 'data', options: { painter: 'tickRing()' } } },
        ],
      },
    ];

    it('shares one import line', () => {
      const code = generateCode(CHARTS, 'react');

      expect(code.match(/^import /gm)).toHaveLength(1);
      expect(code).toMatch(/import \{[^}]*\bGaugeSeries\b[^}]*\bRadialProgressSeries\b[^}]*\btickRing\b/);
      expect(code.match(/<ChartContainer/g)).toHaveLength(2);
    });

    it('wraps the charts in a fragment for React only', () => {
      expect(generateCode(CHARTS, 'react')).toMatch(/\n<>\n {2}<ChartContainer[\s\S]*<\/ChartContainer>\n<\/>$/);
      expect(generateCode(CHARTS, 'svelte')).not.toContain('<>');
      expect(generateCode(CHARTS, 'vue')).not.toContain('<>');
    });

    it('leaves the blank line between charts without trailing spaces', () => {
      expect(generateCode(CHARTS, 'vue')).toContain('</ChartContainer>\n\n  <ChartContainer');
    });
  });

  describe('title', () => {
    const TITLED: ChartCodeConfig = {
      title: { text: 'Cluster', sub: 'share of capacity' },
      components: [{ component: 'GaugeSeries', props: { value: 'cpuLoad' } }],
    };

    it('prints the title as the first child and imports it', () => {
      const code = generateCode(TITLED, 'react');

      expect(code).toContain('<ChartContainer>\n  <Title sub="share of capacity">Cluster</Title>\n  <GaugeSeries');
      expect(code).toMatch(/import \{[^}]*\bTitle\b/);
    });

    it('passes the subtitle as the sub slot in Vue and Svelte', () => {
      expect(generateCode(TITLED, 'vue')).toContain(
        '<Title>\n      Cluster\n      <template #sub>share of capacity</template>\n    </Title>',
      );
      expect(generateCode(TITLED, 'svelte')).toContain(
        '<Title>\n    Cluster\n    <svelte:fragment slot="sub">share of capacity</svelte:fragment>\n  </Title>',
      );
    });

    it('prints a title without a subtitle on one line', () => {
      const code = generateCode({ ...TITLED, title: { text: 'Cluster' } }, 'svelte');

      expect(code).toContain('  <Title>Cluster</Title>');
    });
  });

  it('breaks a short object that holds a multi-line one', () => {
    const config: ChartCodeConfig = {
      components: [
        {
          component: 'LineSeries',
          props: {
            options: { area: { visible: true }, threshold: { value: 0, above: 'upColor', below: 'downColor' } },
          },
        },
      ],
    };

    expect(generateCode(config, 'react')).toContain(
      '    options={{\n      area: { visible: true },\n      threshold: {\n        value: 0,\n        above: upColor,\n        below: downColor,\n      },\n    }}',
    );
  });

  it('indents a multi-line option object one level under its prop', () => {
    const config: ChartCodeConfig = {
      containerProps: { axis: { x: { visible: false }, y: { min: 0 }, crosshair: { snap: true } } },
      components: [
        {
          component: 'GaugeSeries',
          props: { value: 'cpuLoad', options: { max: 500, label: 'p95', format: 'formatMs' } },
        },
      ],
    };

    const code = generateCode(config, 'react');

    expect(code).toContain(
      '<ChartContainer\n  axis={{\n    x: { visible: false },\n    y: { min: 0 },\n    crosshair: { snap: true },\n  }}\n>',
    );
    expect(code).toContain(
      "  <GaugeSeries\n    value={cpuLoad}\n    options={{\n      max: 500,\n      label: 'p95',\n      format: formatMs,\n    }}\n  />",
    );
  });
});
