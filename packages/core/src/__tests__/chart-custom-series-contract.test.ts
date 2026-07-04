import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Everything below is imported from the public barrel only, proving a host
// can implement a fully custom series (here: scatter) with zero deep imports
// into `packages/core/src/**`.
import {
  ChartInstance,
  type ChartTheme,
  type SeriesCreateEnv,
  type SeriesDefinition,
  type SeriesRenderContext,
  type TimePoint,
  type TimeSeriesRenderer,
} from '../index';

interface ScatterOptions {
  color?: string;
  radius?: number;
}

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
    const { context } = ctx.scope;
    context.fillStyle = this.#color;
    for (const point of this.#points) {
      const x = ctx.timeScale.timeToBitmapX(point.time);
      const y = ctx.yScale.valueToBitmapY(point.value);
      context.beginPath();
      context.arc(x, y, this.#radius * ctx.scope.verticalPixelRatio, 0, Math.PI * 2);
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

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const width = 800;
  const height = 400;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('custom series contract (public types only)', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('mounts a fully custom scatter series and answers time-series queries', () => {
    const id = chart.addSeries(ScatterSeriesDef, { color: '#f00' });
    chart.setSeriesData(id, [
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ]);

    expect(chart.getLastData(id)).toEqual({ time: 2, value: 20 });
    expect(chart.getSeriesColor(id)).toBe('#f00');
  });

  it('is picked up by the time-axis dispatch (isTimeSeriesRenderer capability check)', () => {
    const id = chart.addSeries(ScatterSeriesDef);
    chart.setSeriesData(id, [{ time: 1, value: 5 }]);

    expect(chart.getSeriesIdsByType('time')).toContain(id);
    expect(chart.getSeriesIdsByType('scatter')).toEqual([id]);
  });
});
