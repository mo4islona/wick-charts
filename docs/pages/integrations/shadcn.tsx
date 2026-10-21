import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { Segmented } from '../../components/kit';
import {
  BLOCKS,
  type BlockEntry,
  type DemoMessage,
  PALETTES,
  type PaletteName,
  REGISTRY_URL,
  demoUrl,
  installCommand,
} from '../../demos/shadcn/catalog';
import { useIsMobile } from '../../hooks/useIsMobile';
import { hexToRgba, isDarkColor } from '../../utils';

const BLOCK_SOURCES = import.meta.glob<string>('../../../registry/shadcn/blocks/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const HEADINGS = {
  pick: '01 — PICK A BLOCK',
  add: '02 — ADD IT WITH THE CLI',
  byName: '03 — OR ADD BLOCKS BY NAME',
  theme: '04 — THEMED FROM YOUR CSS VARIABLES',
  wrapper: '05 — SIZE A CHART WITH CLASSES',
  frameworks: '06 — VUE AND SVELTE',
};

/** Step headings, for the docs search index. */
export const SHADCN_STEPS: string[] = Object.values(HEADINGS);

const PALETTE_OPTIONS = (Object.keys(PALETTES) as PaletteName[]).map((name) => ({
  value: name,
  label: PALETTES[name].label,
}));

const REGISTRIES_JSON = `{
  "registries": {
    "@wick-charts": "${REGISTRY_URL}/{name}.json"
  }
}`;

const THEME_HOOK_CODE = `const ref = useRef<HTMLDivElement>(null);
const theme = useWickTheme(ref);

return (
  <div ref={ref} className="h-64">
    <ChartContainer theme={theme}>…</ChartContainer>
  </div>
);`;

const WRAPPER_CODE = `import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

import { WickChart } from '@/components/ui/wick-chart';

export function Revenue({ data }: { data: TimePoint[] }) {
  return (
    <WickChart className="aspect-auto h-[250px]">
      <LineSeries data={data} />
      <YAxis />
      <TimeAxis />
      <Tooltip />
    </WickChart>
  );
}`;

const DEFAULT_BLOCK = BLOCKS.find((entry) => entry.name === 'chart-candlestick') ?? BLOCKS[0];

function blockSource(entry: BlockEntry): string {
  return BLOCK_SOURCES[`../../../registry/shadcn/blocks/${entry.name}.tsx`] ?? '';
}

export function ShadcnPage({ theme }: { theme: ChartTheme }) {
  const mobile = useIsMobile();
  const [block, setBlock] = useState(DEFAULT_BLOCK);
  const [palette, setPalette] = useState<PaletteName>('neutral');
  const mode = isDarkColor(theme.background) ? 'dark' : 'light';

  const frameRef = useRef<HTMLIFrameElement>(null);
  // Later changes go by message, so the frame keeps its live data instead of reloading.
  const [frameSrc] = useState(() => demoUrl({ block: block.name, mode, palette, embed: true }));

  const syncFrame = useCallback(() => {
    const message: DemoMessage = { type: 'wick-shadcn-demo', block: block.name, mode, palette };
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [block.name, mode, palette]);

  useEffect(() => syncFrame(), [syncFrame]);

  const pickBlock = (next: BlockEntry) => {
    setBlock(next);

    // On a phone the preview sits above the list, out of view.
    if (mobile) frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const steps: Step[] = [
    {
      heading: HEADINGS.pick,
      body: (
        <>
          <p style={{ margin: 0 }}>
            Each block is a chart in a shadcn <code>Card</code>, with demo data for you to replace. Pick one to preview
            it {mobile ? 'above' : 'on the right'}.
          </p>
          <BlockList theme={theme} value={block} onPick={pickBlock} />
        </>
      ),
    },
    {
      heading: HEADINGS.add,
      body: (
        <>
          Run the shadcn CLI with the block's URL. It copies the block into your components with what it needs: the{' '}
          <code>wick-chart</code> wrapper, the <code>wick-theme</code> hook, the shadcn <code>card</code> and the{' '}
          <code>@wick-charts/react</code> package. Then render <code>&lt;{block.component} /&gt;</code> from{' '}
          <code>@/components/{block.name}</code>. The files are yours to change, as with any shadcn component.
        </>
      ),
      code: installCommand(block.name),
    },
    {
      heading: HEADINGS.byName,
      body: (
        <>
          Add the registry to <code>components.json</code> once, and every item installs by name:{' '}
          <code>npx shadcn@latest add @wick-charts/{block.name}</code>. The{' '}
          <a href={`${REGISTRY_URL}/registry.json`} target="_blank" rel="noopener noreferrer">
            registry index
          </a>{' '}
          lists every item.
        </>
      ),
      code: REGISTRIES_JSON,
    },
    {
      heading: HEADINGS.theme,
      body: (
        <>
          The <code>wick-theme</code> item installs <code>useWickTheme(ref?)</code>. It builds a Wick Charts theme from{' '}
          <code>--background</code>, <code>--foreground</code>, <code>--muted-foreground</code>, <code>--border</code>{' '}
          and <code>--chart-1</code> … <code>--chart-5</code>, and follows light and dark mode and any token change.
          Series take the <code>--chart-*</code> colors in order; candles and order book sides use the theme's hue
          instead of green and red. Pass a ref to read the tokens where the chart is, for example inside a scoped{' '}
          <code>.dark</code> panel. Switch the chart colors above the preview to see a block follow them.
        </>
      ),
      code: THEME_HOOK_CODE,
    },
    {
      heading: HEADINGS.wrapper,
      body: (
        <>
          The <code>wick-chart</code> item installs <code>WickChart</code>: a <code>ChartContainer</code> themed by{' '}
          <code>useWickTheme</code>, with every <code>ChartContainer</code> prop. Size it with classes, as you size the
          shadcn chart container: <code>aspect-video</code> by default, <code>aspect-auto h-[250px]</code> for a fixed
          height. It draws horizontal grid lines only; pass <code>grid</code> to change that. <code>theme</code> takes a
          theme, or a function that adjusts the generated one. Define that function outside the component: a new
          function on each render themes the chart again.
        </>
      ),
      code: WRAPPER_CODE,
    },
    {
      heading: HEADINGS.frameworks,
      body: (
        <>
          The registry is for React. In Vue and Svelte, use <code>@wick-charts/vue</code> or{' '}
          <code>@wick-charts/svelte</code> directly, and build a theme from your colors with <code>createTheme</code>.
        </>
      ),
    },
  ];

  return (
    <AdvancedLayout
      theme={theme}
      source={blockSource(block)}
      lead={
        <>
          <p style={{ margin: 0 }}>
            Wick Charts has a{' '}
            <a href="https://ui.shadcn.com/" target="_blank" rel="noopener noreferrer">
              shadcn/ui
            </a>{' '}
            registry for React. Like shadcn components, its items install as source files you own: chart blocks in a
            shadcn card, a <code>WickChart</code> wrapper you size with classes, and a hook that themes the charts from
            your CSS variables.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            The preview is a shadcn app in this page's light or dark mode.{' '}
            <a href={demoUrl({ mode, palette })} target="_blank" rel="noopener noreferrer">
              Open every block in a new window ↗
            </a>
          </p>
        </>
      }
      chartControls={
        <>
          <span>Chart colors:</span>
          <Segmented<PaletteName>
            theme={theme}
            value={palette}
            onChange={setPalette}
            ariaLabel="Chart colors"
            options={PALETTE_OPTIONS}
          />
        </>
      }
      chart={
        <iframe
          ref={frameRef}
          src={frameSrc}
          onLoad={syncFrame}
          title={`${block.title} preview`}
          style={{ flex: 1, width: '100%', border: 0, display: 'block', colorScheme: mode }}
        />
      }
      chartHeight="clamp(440px, 70vh, 600px)"
      mobileChartHeight={480}
      steps={steps}
    />
  );
}

function BlockList({
  theme,
  value,
  onPick,
}: {
  theme: ChartTheme;
  value: BlockEntry;
  onPick: (next: BlockEntry) => void;
}) {
  const text = theme.tooltip.textColor;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 4,
        marginTop: 12,
      }}
    >
      {BLOCKS.map((entry) => {
        const active = entry.name === value.name;

        return (
          <button
            key={entry.name}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(entry)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '8px 10px',
              border: `1px solid ${active ? hexToRgba(text, 0.28) : 'transparent'}`,
              borderRadius: 6,
              background: active ? hexToRgba(text, 0.08) : 'transparent',
              color: text,
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 500 }}>{entry.title}</span>
            <span style={{ fontSize: theme.typography.fontSize - 1, lineHeight: 1.45, color: hexToRgba(text, 0.62) }}>
              {entry.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
