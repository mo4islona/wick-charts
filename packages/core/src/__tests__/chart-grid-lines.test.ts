// @vitest-environment happy-dom
/**
 * Gridline directions (`grid.horizontal` / `grid.vertical`) and the crosshair
 * hairlines on a category axis, read from the main / overlay canvas strokes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions, GridOptions } from '../chart/options';
import type { CanvasRecorder } from '../testing/recording-context';
import { catppuccin } from '../theme/themes/catppuccin';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;

interface Segment {
  from: [number, number];
  to: [number, number];
}

/** Every `moveTo → lineTo` pair stroked in `color`, as segments. */
function segmentsIn(spy: CanvasRecorder, color: string): Segment[] {
  const segments: Segment[] = [];
  let from: [number, number] | null = null;
  for (const call of spy.calls) {
    if (call.strokeStyle !== color) continue;
    if (call.method === 'moveTo') from = [Number(call.args[0]), Number(call.args[1])];
    if (call.method === 'lineTo' && from !== null) {
      segments.push({ from, to: [Number(call.args[0]), Number(call.args[1])] });
      from = null;
    }
  }

  return segments;
}

const isHorizontal = (segment: Segment) => segment.from[1] === segment.to[1] && segment.from[0] !== segment.to[0];
const isVertical = (segment: Segment) => segment.from[0] === segment.to[0] && segment.from[1] !== segment.to[1];

function canvasSpies(container: HTMLElement): { main: CanvasRecorder; overlay: CanvasRecorder } {
  const [main, overlay] = Array.from(container.querySelectorAll('canvas')).map((canvas) => canvas.__spy);
  if (!main || !overlay) throw new Error('recording canvases not installed');

  return { main, overlay };
}

describe('grid line directions', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  function mountLine(options: ChartOptions): CanvasRecorder {
    chart = new ChartInstance(container, { interactive: false, ...options });
    chart.setSeriesData(
      chart.addSeries('line'),
      [50, 55, 60, 65, 70, 60, 50].map((value, i) => ({ time: 1_000_000 + i * INTERVAL, value })),
    );
    raf.flush(60);

    return canvasSpies(container).main;
  }

  function gridAfter(spy: CanvasRecorder, grid: GridOptions): Segment[] {
    spy.reset();
    chart.setGrid(grid);
    raf.flush(2);

    return segmentsIn(spy, catppuccin.theme.grid.color);
  }

  it('draws both directions by default', () => {
    const spy = mountLine({});
    const segments = gridAfter(spy, { visible: true });

    expect(segments.some(isHorizontal)).toBe(true);
    expect(segments.some(isVertical)).toBe(true);
  });

  it('keeps only the horizontal lines with `vertical: false`', () => {
    const spy = mountLine({ grid: { vertical: false } });
    const segments = gridAfter(spy, { vertical: false });

    expect(segments.some(isHorizontal)).toBe(true);
    expect(segments.some(isVertical)).toBe(false);
  });

  it('keeps only the vertical lines with `horizontal: false`', () => {
    const spy = mountLine({});
    const segments = gridAfter(spy, { horizontal: false });

    expect(segments.some(isHorizontal)).toBe(false);
    expect(segments.some(isVertical)).toBe(true);
  });
});

describe('crosshair on a category axis', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  function hairlines(options: ChartOptions, data: object[]): Segment[] {
    chart = new ChartInstance(container, options);
    chart.setSeriesData(chart.addSeries('bar'), data);
    raf.flush(60);

    const { overlay } = canvasSpies(container);
    overlay.reset();
    const range = chart.getVisibleRange();
    chart.setCrosshair({ time: (range.from + range.to) / 2, y: 20 });
    raf.flush(2);

    return segmentsIn(overlay, catppuccin.theme.crosshair.color);
  }

  it('draws no horizontal value line across the category bands', () => {
    const segments = hairlines({ axis: { x: { type: 'category' } } }, [
      { x: 'Jan', value: 10 },
      { x: 'Feb', value: 30 },
      { x: 'Mar', value: 20 },
    ]);

    expect(segments.some(isVertical)).toBe(true);
    expect(segments.some(isHorizontal)).toBe(false);
  });

  it('still draws both hairlines on a time axis', () => {
    const segments = hairlines(
      {},
      [10, 30, 20].map((value, i) => ({ time: 1_000_000 + i * INTERVAL, value })),
    );

    expect(segments.some(isVertical)).toBe(true);
    expect(segments.some(isHorizontal)).toBe(true);
  });
});
