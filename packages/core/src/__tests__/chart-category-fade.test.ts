// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import type { RecordedCall } from '../testing/recording-context';
import type { TimePointInput, XPointInput } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const CATEGORY_BARS: XPointInput[] = [
  { x: 'Coal', value: 30 },
  { x: 'Gas', value: 50 },
  { x: 'Wind', value: 40 },
];

const TIME_BARS: TimePointInput[] = [1, 2, 3].map((i) => ({ time: i * 86_400_000, value: i }));

describe('X edge fade on a category axis', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  /** The full-height erase rects the main layer paints for its edge fades. */
  function fadeRects(args: { options: ChartOptions; points: XPointInput[] | TimePointInput[] }): RecordedCall[] {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, ...args.options });
    const spy = container.querySelector('canvas')?.__spy;
    if (!spy) throw new Error('recording canvas not installed');

    const id = chart.addSeries('bar');
    chart.setSeriesData(id, args.points);
    raf.flush();

    const fullHeight = (call: RecordedCall) => call.args[1] === 0;

    return spy
      .callsOf('fillRect')
      .filter((call) => call.globalCompositeOperation === 'destination-out' && fullHeight(call));
  }

  it('dims no band by default: the bands cannot scroll under the axis', () => {
    const rects = fadeRects({ options: { axis: { x: { type: 'category' } } }, points: CATEGORY_BARS });

    expect(rects).toEqual([]);
  });

  it('keeps a fade that is set explicitly', () => {
    const options: ChartOptions = { axis: { x: { type: 'category' } }, fade: { right: 40 } };
    const rects = fadeRects({ options, points: CATEGORY_BARS });

    expect(rects.some((call) => call.args[2] === 40)).toBe(true);
  });

  it('keeps the default fade on a time axis', () => {
    const rects = fadeRects({ options: {}, points: TIME_BARS });

    expect(rects.length).toBeGreaterThan(0);
  });
});
