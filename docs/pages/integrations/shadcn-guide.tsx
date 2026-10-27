import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { ChartSketch, type SketchName } from '../../components/ChartSketch';
import { Segmented } from '../../components/kit';
import {
  BLOCKS,
  type BlockEntry,
  type DemoMessage,
  type Flavor,
  PALETTES,
  type PaletteName,
  demoUrl,
} from '../../demos/shadcn/catalog';
import { useIsMobile } from '../../hooks/useIsMobile';
import { routeToPath } from '../../router';
import { type Route, getSections, labelForRoute } from '../../routes';
import { hexToRgba, isDarkColor } from '../../utils';

export const HEADINGS = {
  pick: 'BLOCKS',
  add: '01 — INSTALL',
  use: '02 — USE IT',
  own: '03 — BUILD YOUR OWN CHART',
};

const PALETTE_OPTIONS = (Object.keys(PALETTES) as PaletteName[]).map((name) => ({
  value: name,
  label: PALETTES[name].label,
}));

const DEFAULT_BLOCK = BLOCKS.find((entry) => entry.name === 'chart-candlestick') ?? BLOCKS[0];

interface BlockSeries {
  series: string;
  /** The chart page with the data format. */
  chart: Route;
  /** What the series takes when it is not an array. */
  input?: ReactNode;
  /** The Charts menu entry whose blocks the tile joins, when not `chart`. */
  menu?: Route;
  /** The tile icon. */
  sketch: SketchName;
}

/** The series that draws a block's data. */
const BLOCK_SERIES: Record<string, BlockSeries> = {
  'chart-line-live': { series: 'LineSeries', chart: 'charts/line', sketch: 'line-live' },
  'chart-candlestick': { series: 'CandlestickSeries', chart: 'charts/candlestick', sketch: 'candlestick' },
  'chart-order-book': { series: 'DepthSeries', chart: 'charts/depth', sketch: 'order-book' },
  'chart-sparkline': {
    series: 'LineSeries',
    chart: 'charts/line',
    menu: 'charts/sparkline',
    sketch: 'sparkline',
  },
  'chart-bar-grouped': { series: 'BarSeries', chart: 'charts/bar', sketch: 'bar-grouped' },
  'chart-pie-donut': { series: 'PieSeries', chart: 'charts/pie', sketch: 'donut' },
  'chart-band-latency': { series: 'BandSeries', chart: 'charts/band', sketch: 'band' },
  'chart-area-stacked': { series: 'LineSeries', chart: 'charts/line', sketch: 'area-stacked' },
  'chart-heatmap': { series: 'HeatmapSeries', chart: 'charts/heatmap', sketch: 'heatmap' },
  'chart-line-annotations': { series: 'LineSeries', chart: 'charts/line', sketch: 'line-annotations' },
  'chart-line-navigator': { series: 'LineSeries', chart: 'charts/line', sketch: 'line-navigator' },
  'chart-sankey': {
    series: 'SankeySeries',
    chart: 'charts/sankey',
    sketch: 'sankey',
    input: (
      <>
        your <code>nodes</code> and <code>links</code>
      </>
    ),
  },
  'chart-gauge': {
    series: 'GaugeSeries',
    chart: 'charts/gauge',
    sketch: 'gauge',
    input: (
      <>
        your number as <code>value</code>
      </>
    ),
  },
  'chart-radial-progress': { series: 'RadialProgressSeries', chart: 'charts/gauge', sketch: 'radial-progress' },
};

/** How to put your data into a block; `file` is the block file the CLI added. */
export function YourData({ block, file }: { block: BlockEntry; file: string }) {
  const entry = BLOCK_SERIES[block.name];
  if (!entry) {
    return (
      <>
        The block draws demo data. To draw yours, replace it in <code>{file}</code>.
      </>
    );
  }

  return (
    <>
      The block draws demo data. To draw yours, replace it in <code>{file}</code> and pass {entry.input ?? 'your array'}{' '}
      to <code>&lt;{entry.series}&gt;</code>. Data format:{' '}
      <a href={routeToPath(entry.chart)}>{labelForRoute(entry.chart)}</a>.
    </>
  );
}

/** What differs between the React and the Vue registry on the page. */
export interface GuideCopy {
  /** The line above the columns; `demoLink` opens every block in a new window. */
  lead: (demoLink: ReactNode) => ReactNode;
  /** The steps after the block picker. */
  steps: (block: BlockEntry) => Step[];
}

export interface ShadcnGuideProps {
  theme: ChartTheme;
  flavor: Flavor;
  copy: GuideCopy;
}

/** The shadcn guide: a block picker, the demo of the picked registry in a frame and the install steps. */
export function ShadcnGuide({ theme, flavor, copy }: ShadcnGuideProps) {
  const mobile = useIsMobile();
  const [block, setBlock] = useState(DEFAULT_BLOCK);
  const [palette, setPalette] = useState<PaletteName>('neutral');
  const mode = isDarkColor(theme.background) ? 'dark' : 'light';

  // A framework pick loads the other demo app; later changes go by message, so the frame keeps its live data.
  const [frame, setFrame] = useState(() => ({
    flavor,
    src: demoUrl({ flavor, block: block.name, mode, palette, embed: true }),
  }));
  if (frame.flavor !== flavor) {
    setFrame({ flavor, src: demoUrl({ flavor, block: block.name, mode, palette, embed: true }) });
  }

  const frameRef = useRef<HTMLIFrameElement>(null);
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

  const pickStep: Step = {
    heading: HEADINGS.pick,
    body: <BlockTiles theme={theme} value={block} onPick={pickBlock} />,
  };

  const demoLink = (
    <a href={demoUrl({ flavor, mode, palette })} target="_blank" rel="noopener noreferrer">
      All blocks on one page ↗
    </a>
  );

  return (
    <AdvancedLayout
      theme={theme}
      lead={copy.lead(demoLink)}
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
          key={frame.flavor}
          ref={frameRef}
          src={frame.src}
          onLoad={syncFrame}
          title={`${block.title} preview`}
          style={{ flex: 1, width: '100%', border: 0, display: 'block', colorScheme: mode }}
        />
      }
      chartHeight="clamp(440px, 70vh, 600px)"
      mobileChartHeight={480}
      steps={[pickStep, ...copy.steps(block)]}
    />
  );
}

const CHART_ORDER: Route[] =
  getSections()
    .find((section) => section.heading === 'Charts')
    ?.items?.map((item) => item.route) ?? [];

function menuRank(entry: BlockEntry): number {
  const series = BLOCK_SERIES[entry.name];
  const route = series?.menu ?? series?.chart;
  const rank = route ? CHART_ORDER.indexOf(route) : -1;

  return rank === -1 ? CHART_ORDER.length : rank;
}

/** In the order of the Charts menu, so the blocks of one chart sit together. */
const TILE_BLOCKS = [...BLOCKS].sort((a, b) => menuRank(a) - menuRank(b));

/** The title without the trailing "Chart", which most tiles would repeat. */
function tileLabel(entry: BlockEntry): string {
  return entry.title.replace(/ Chart$/, '').replace(/^Line Chart with /, 'Line with ');
}

/** One tile per block, with a sketch of the block. */
function BlockTiles({
  theme,
  value,
  onPick,
}: {
  theme: ChartTheme;
  value: BlockEntry;
  onPick: (next: BlockEntry) => void;
}) {
  const text = theme.tooltip.textColor;
  const surface = `color-mix(in srgb, ${text} 4%, transparent)`;
  // Opaque: a translucent ink softens the thin strokes.
  const iconColor = `color-mix(in srgb, ${text} 75%, ${theme.background})`;

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8, marginTop: 4 }}
    >
      {TILE_BLOCKS.map((entry) => {
        const active = entry.name === value.name;
        const sketch = BLOCK_SERIES[entry.name]?.sketch;

        return (
          <button
            key={entry.name}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(entry)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 84,
              padding: '8px 6px',
              border: `1px solid ${active ? hexToRgba(text, 0.4) : theme.tooltip.borderColor}`,
              borderRadius: 12,
              background: active ? hexToRgba(text, 0.08) : surface,
              color: text,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: theme.typography.fontSize - 0.5,
              fontWeight: active ? 500 : 400,
              lineHeight: 1.3,
              textAlign: 'center',
            }}
          >
            {sketch && (
              <span style={{ display: 'flex', color: active ? text : iconColor }}>
                <ChartSketch name={sketch} height={28} />
              </span>
            )}
            {tileLabel(entry)}
          </button>
        );
      })}
    </div>
  );
}
