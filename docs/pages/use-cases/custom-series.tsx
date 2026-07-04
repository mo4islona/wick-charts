import { useLayoutEffect, useMemo, useRef } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type SeriesCreateEnv,
  type SeriesDefinition,
  type SeriesRenderContext,
  type TimePoint,
  type TimeSeriesRenderer,
  Title,
  XAxis,
  YAxis,
  useChartInstance,
} from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateLineData } from '../../data';
import source from './custom-series.tsx?raw';

const COUNT = 180;

interface ScatterOptions {
  color?: string;
  radius?: number;
}

/**
 * A from-scratch series kind — not a painter override on an existing series,
 * a whole new renderer. Every type it touches (`TimeSeriesRenderer`,
 * `SeriesRenderContext`, `SeriesCreateEnv`, `SeriesDefinition`) comes from the
 * public `@wick-charts/react` barrel; nothing here reaches into
 * `@wick-charts/core/src/**`.
 */
class ScatterRenderer implements TimeSeriesRenderer {
  readonly kind = 'scatter';

  #points: TimePoint[] = [];
  #color: string;
  #radius: number;
  #visible = true;

  constructor(env: SeriesCreateEnv, options: Partial<ScatterOptions>) {
    this.#color = options.color ?? env.theme.line.color;
    this.#radius = options.radius ?? 3;
  }

  render(ctx: SeriesRenderContext): void {
    const { context, verticalPixelRatio } = ctx.scope;
    context.fillStyle = this.#color;
    for (const point of this.#points) {
      const x = ctx.timeScale.timeToBitmapX(point.time);
      const y = ctx.yScale.valueToBitmapY(point.value);
      context.beginPath();
      context.arc(x, y, this.#radius * verticalPixelRatio, 0, Math.PI * 2);
      context.fill();
    }
  }

  setData(data: unknown): void {
    this.#points = data as TimePoint[];
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, visible: boolean): void {
    this.#visible = visible;
  }

  isLayerVisible(): boolean {
    return this.#visible;
  }

  getLayerColors(): string[] {
    return [this.#color];
  }

  applyTheme(theme: ChartTheme): void {
    this.#color = theme.line.color;
  }

  updateOptions(options: Partial<ScatterOptions>): void {
    if (options.color) this.#color = options.color;
    if (options.radius) this.#radius = options.radius;
  }

  getTimeBounds(): { first: number; last: number } | null {
    if (this.#points.length === 0) return null;

    return { first: this.#points[0].time, last: this.#points[this.#points.length - 1].time };
  }

  getLastDataPoint(): TimePoint | null {
    return this.#points[this.#points.length - 1] ?? null;
  }

  getSecondLastDataPoint(): TimePoint | null {
    return this.#points[this.#points.length - 2] ?? null;
  }

  sampleTimes(maxCount: number): number[] {
    return this.#points.slice(0, maxCount).map((p) => p.time);
  }

  getVisibleDataPoints(from: number, to: number): readonly TimePoint[] {
    return this.#points.filter((p) => p.time >= from && p.time <= to);
  }

  getValueRange(from: number, to: number): { min: number; max: number } | null {
    const visible = this.getVisibleDataPoints(from, to);
    if (visible.length === 0) return null;

    const values = visible.map((p) => p.value);

    return { min: Math.min(...values), max: Math.max(...values) };
  }

  dispose(): void {}
}

const ScatterSeriesDef: SeriesDefinition<ScatterOptions> = {
  type: 'scatter',
  create: (env, options) => new ScatterRenderer(env, options),
};

/**
 * A minimal `<ScatterSeries>` wrapper — the same `useChartInstance` +
 * `useLayoutEffect` mount/unmount shape every built-in series component
 * (`<LineSeries>`, `<BarSeries>`, …) uses internally. Writing one of these
 * for a custom renderer takes no library changes and no registration step.
 */
function ScatterSeries({ data, options }: { data: TimePoint[]; options?: ScatterOptions }) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(ScatterSeriesDef, options);
    seriesRef.current = id;

    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (id) chart.setSeriesData(id, data);
  }, [chart, data]);

  return null;
}

const STEPS: Step[] = [
  {
    heading: '01 — IMPLEMENT THE RENDERER CONTRACT',
    body: (
      <>
        A series is a class implementing <code>TimeSeriesRenderer</code> (or the spatial variant for a no-time-axis
        series). Every type the interface touches — <code>SeriesRenderContext</code>, <code>SeriesCreateEnv</code>,{' '}
        <code>XScale</code>/<code>YScale</code>, <code>BitmapCoordinateSpace</code> — is exported from the package root.
      </>
    ),
    code: `class ScatterRenderer implements TimeSeriesRenderer {\n  readonly kind = 'scatter';\n  render(ctx: SeriesRenderContext) {\n    const x = ctx.timeScale.timeToBitmapX(point.time);\n    const y = ctx.yScale.valueToBitmapY(point.value);\n    // draw into ctx.scope.context\n  }\n  // setData, getLayerCount, getTimeBounds, getValueRange, …\n}`,
  },
  {
    heading: '02 — WRAP IT IN A DEFINITION',
    body: (
      <>
        <code>SeriesDefinition.create()</code> is the factory the chart calls — it hands back the theme and requested
        layer count, and returns the renderer instance. No name registry: pass the definition object straight to{' '}
        <code>chart.addSeries()</code>.
      </>
    ),
    code: `const ScatterSeriesDef: SeriesDefinition<ScatterOptions> = {\n  type: 'scatter',\n  create: (env, options) => new ScatterRenderer(env, options),\n};`,
  },
  {
    heading: '03 — MOUNT IT LIKE ANY BUILT-IN SERIES',
    body: (
      <>
        A thin component reading <code>useChartInstance()</code> and calling <code>chart.addSeries(def, options)</code>{' '}
        in <code>useLayoutEffect</code> is all a JSX wrapper needs — the same shape every shipped series component uses
        internally.
      </>
    ),
    code: `<ChartContainer>\n  <ScatterSeries data={points} options={{ color: '#f2a71b' }} />\n  <YAxis />\n  <XAxis />\n</ChartContainer>`,
  },
];

export function CustomSeriesPage({ theme }: { theme: ChartTheme }) {
  const points = useMemo(() => generateLineData(COUNT, 100), []);

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          A brand-new series kind — scatter — built from nothing but public types. No painter override, no fork of an
          existing renderer: <code>ScatterRenderer</code> implements <code>TimeSeriesRenderer</code> directly and plugs
          into the chart the same way <code>LineSeriesDef</code> or <code>BarSeriesDef</code> do internally.
        </>
      }
      chart={
        <ChartContainer theme={theme}>
          <Title sub="Custom series · scatter · public contract only">Scatter demo</Title>
          <ScatterSeries data={points} options={{ color: theme.seriesColors[0], radius: 3 }} />
          <Crosshair />
          <YAxis />
          <XAxis />
        </ChartContainer>
      }
      steps={STEPS}
    />
  );
}
