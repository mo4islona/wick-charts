import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { buildHoverSnapshots, buildLastSnapshots, formatRowValue } from '../snapshots';
import { githubLight } from '../theme/themes/github-light';

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

describe('ChartInstance.getSeriesIdsByType', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('partitions series by renderer type', () => {
    const l = chart.addSeries('line');
    const p = chart.addSeries('pie');
    const b = chart.addSeries('bar');

    expect(chart.getSeriesIdsByType('time').sort()).toEqual([l, b].sort());
    expect(chart.getSeriesIdsByType('pie')).toEqual([p]);
  });

  it('visibleOnly excludes series with isSeriesVisible=false', () => {
    const shown = chart.addSeries('line');
    const hidden = chart.addSeries('line');
    chart.setSeriesVisible(hidden, false);

    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).toEqual([shown]);
    expect(chart.getSeriesIdsByType('time').sort()).toEqual([shown, hidden].sort());
  });

  it('visibleOnly excludes multi-layer series when every layer is hidden', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 1 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 2 }], 1);

    // Both layers visible → included.
    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).toContain(id);

    chart.setLayerVisible(id, 0, false);
    // One layer still visible → included.
    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).toContain(id);

    chart.setLayerVisible(id, 1, false);
    // Every layer hidden → excluded.
    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).not.toContain(id);
  });

  it('singleLayerOnly excludes multi-layer series', () => {
    const single = chart.addSeries('line');
    const multi = chart.addSeries('line', { layers: 3 });

    const result = chart.getSeriesIdsByType('time', { singleLayerOnly: true });
    expect(result).toEqual([single]);
    expect(result).not.toContain(multi);
  });
});

describe('ChartInstance.getStackedLastValue', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('matches getLastValue for single-layer line series', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(id, [
      { time: 1, value: 10 },
      { time: 2, value: 42 },
    ]);
    expect(chart.getStackedLastValue(id)?.value).toBe(42);
    expect(chart.getStackedLastValue(id)?.value).toBe(chart.getLastValue(id)?.value);
  });

  it('returns cumulative stack top for stacked multi-layer line series', () => {
    const id = chart.addSeries('line', { layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 25 }], 1);
    expect(chart.getStackedLastValue(id)?.value).toBe(35);
  });

  it('returns cumulative stack top for stacked multi-layer bar series', () => {
    const id = chart.addSeries('bar', { layers: 3, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 5 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 7 }], 1);
    chart.setSeriesData(id, [{ time: 1, value: 3 }], 2);
    expect(chart.getStackedLastValue(id)?.value).toBe(15);
  });

  it('returns null for unknown ids', () => {
    expect(chart.getStackedLastValue('nope')).toBeNull();
  });

  it('normal-stacked bar with mixed-sign layers anchors to the positive top when positives exist', () => {
    // The previous implementation returned a naive net sum. For mixed-sign
    // values that collapses to a number that doesn't match
    // `renderStacked`'s geometry — positives and negatives stack
    // independently; the painted head sits on the side with contributions.
    const id = chart.addSeries('bar', { layers: 3, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: -4 }], 1);
    chart.setSeriesData(id, [{ time: 1, value: 6 }], 2);

    // Positive top = 10 + 6 = 16, net sum = 12 (rejected).
    expect(chart.getStackedLastValue(id)?.value).toBe(16);
  });

  it('normal-stacked bar with all-negative layers anchors to the negative bottom', () => {
    const id = chart.addSeries('bar', { layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: -5 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: -7 }], 1);
    expect(chart.getStackedLastValue(id)?.value).toBe(-12);
  });

  it('percent-stacked bar reports +100 / -100 / 0 based on the sign of contributions', () => {
    const positiveOnly = chart.addSeries('bar', { layers: 2, stacking: 'percent' });
    chart.setSeriesData(positiveOnly, [{ time: 1, value: 3 }], 0);
    chart.setSeriesData(positiveOnly, [{ time: 1, value: 5 }], 1);
    expect(chart.getStackedLastValue(positiveOnly)?.value).toBe(100);

    const negativeOnly = chart.addSeries('bar', { layers: 2, stacking: 'percent' });
    chart.setSeriesData(negativeOnly, [{ time: 1, value: -2 }], 0);
    chart.setSeriesData(negativeOnly, [{ time: 1, value: -8 }], 1);
    // Previously returned 0 for all-negative percent stacks.
    expect(chart.getStackedLastValue(negativeOnly)?.value).toBe(-100);

    const zero = chart.addSeries('bar', { layers: 1, stacking: 'percent' });
    chart.setSeriesData(zero, [{ time: 1, value: 0 }], 0);
    // Single-layer path uses raw last value, which is 0 here.
    expect(chart.getStackedLastValue(zero)?.value).toBe(0);
  });

  it('normal-stacked line with mixed-sign layers anchors to the positive top', () => {
    const id = chart.addSeries('line', { layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 4 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: -3 }], 1);
    expect(chart.getStackedLastValue(id)?.value).toBe(4);
  });

  it('ragged stream: a layer that hasn’t ticked as recently as its siblings still contributes its last known value, not 0', () => {
    // Each layer streams independently (e.g. one WebSocket tick per symbol) —
    // layer 1 is one tick behind layer 0 at read time. The stacked top must
    // hold layer 1's last reading (20) rather than dropping it to 0 the
    // instant layer 0 ticks past it.
    const id = chart.addSeries('line', { layers: 2, stacking: 'normal', entryMs: 0 });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 20 }], 1);
    chart.appendData(id, { time: 2, value: 15 }, 0);

    expect(chart.getStackedLastValue(id)?.value).toBe(35);
  });

  it('a layer that ends in a null gap adds 0 to the stack, not its older reading', () => {
    const ids = [
      chart.addSeries('line', { layers: 2, stacking: 'normal', entryMs: 0 }),
      chart.addSeries('bar', { layers: 2, stacking: 'normal' }),
    ];
    for (const id of ids) {
      chart.setSeriesData(
        id,
        [
          { time: 1, value: 10 },
          { time: 2, value: null },
        ],
        0,
      );
      chart.setSeriesData(
        id,
        [
          { time: 1, value: 5 },
          { time: 2, value: 5 },
        ],
        1,
      );

      expect(chart.getStackedLastValue(id)?.value).toBe(5);
    }
  });

  it('a stack whose every layer ends in a null gap reports the last row drawn before it', () => {
    const aligned = chart.addSeries('line', { layers: 2, stacking: 'normal', entryMs: 0 });
    chart.setSeriesData(
      aligned,
      [
        { time: 1, value: 10 },
        { time: 2, value: null },
      ],
      0,
    );
    chart.setSeriesData(
      aligned,
      [
        { time: 1, value: 5 },
        { time: 2, value: null },
      ],
      1,
    );

    expect(chart.getStackedLastValue(aligned)?.value).toBe(15);
  });

  it('when every layer ends in a gap, readings from different times are not summed', () => {
    const ids = [
      chart.addSeries('line', { layers: 2, stacking: 'normal', entryMs: 0 }),
      chart.addSeries('bar', { layers: 2, stacking: 'normal' }),
    ];
    for (const id of ids) {
      chart.setSeriesData(
        id,
        [
          { time: 1, value: 10 },
          { time: 2, value: null },
          { time: 3, value: null },
        ],
        0,
      );
      chart.setSeriesData(
        id,
        [
          { time: 2, value: 7 },
          { time: 3, value: null },
        ],
        1,
      );

      // The last row drawn is t=2, where only the second layer has a reading.
      expect(chart.getStackedLastValue(id)?.value).toBe(7);
    }
  });
});

describe('ChartInstance.getLayerSnapshots (real layerIndex + sample time)', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('reports each entry with its owning layerIndex — not the filtered array index', () => {
    // Previously callers inferred layerIndex from the array position,
    // which silently shifted when hidden layers were filtered out.
    const id = chart.addSeries('line', { layers: 3 });
    chart.setSeriesData(id, [{ time: 10, value: 1 }], 0);
    chart.setSeriesData(id, [{ time: 10, value: 2 }], 1);
    chart.setSeriesData(id, [{ time: 10, value: 3 }], 2);
    chart.setLayerVisible(id, 1, false);

    const snaps = chart.getLayerSnapshots(id, 10);
    expect(snaps).toHaveLength(2);
    expect(snaps?.[0].layerIndex).toBe(0);
    expect(snaps?.[1].layerIndex).toBe(2);
  });

  it('reports the resolved sample time per layer, not the query time', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(
      id,
      [
        { time: 100, value: 1 },
        { time: 200, value: 2 },
      ],
      0,
    );
    chart.setSeriesData(
      id,
      [
        { time: 100, value: 10 },
        { time: 200, value: 20 },
      ],
      1,
    );

    // Query midway; both layers snap to t=200 (later point wins at ties).
    const snaps = chart.getLayerSnapshots(id, 150);
    expect(snaps?.[0].time).toBe(200);
    expect(snaps?.[1].time).toBe(200);
  });
});

describe('ChartInstance.getLayerLastSnapshots', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('returns null for single-layer series', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(id, [{ time: 1, value: 10 }]);
    expect(chart.getLayerLastSnapshots(id)).toBeNull();
  });

  it('returns per-layer last for ragged multi-layer line series — each layer at its own time', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(
      id,
      [
        { time: 1, value: 20 },
        { time: 5, value: 30 },
      ],
      1,
    );

    const snaps = chart.getLayerLastSnapshots(id);
    expect(snaps).not.toBeNull();
    expect(snaps).toHaveLength(2);
    expect(snaps?.[0]).toMatchObject({ layerIndex: 0, time: 1, value: 10 });
    expect(snaps?.[1]).toMatchObject({ layerIndex: 1, time: 5, value: 30 });
  });

  it('skips hidden layers', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 20 }], 1);
    chart.setLayerVisible(id, 0, false);

    const snaps = chart.getLayerLastSnapshots(id);
    expect(snaps).toHaveLength(1);
    expect(snaps?.[0].layerIndex).toBe(1);
  });
});

describe('ChartInstance.getSeriesLabel', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('returns the label set on addSeries for line / bar / candlestick / pie', () => {
    // All four series types preserve the `label` option through addSeries.
    const line = chart.addSeries('line', { label: 'Price' });
    const bar = chart.addSeries('bar', { label: 'Volume' });
    const candle = chart.addSeries('candlestick', { label: 'BTC' });
    const pie = chart.addSeries('pie', { label: 'Share' });

    expect(chart.getSeriesLabel(line)).toBe('Price');
    expect(chart.getSeriesLabel(bar)).toBe('Volume');
    expect(chart.getSeriesLabel(candle)).toBe('BTC');
    expect(chart.getSeriesLabel(pie)).toBe('Share');
  });

  it('returns undefined when no label was provided', () => {
    const id = chart.addSeries('candlestick');
    expect(chart.getSeriesLabel(id)).toBeUndefined();
  });
});

describe('ChartInstance.getDataBounds (multi-layer aggregation)', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  // `getDataBounds` is private — it feeds #dataStart/#dataEnd and the X fit.
  const dataBounds = (c: ChartInstance): { first: number | undefined; last: number | undefined } =>
    (c as unknown as { getDataBounds(): { first: number | undefined; last: number | undefined } }).getDataBounds();

  it('aggregates across multi-layer time ranges (not just layer 0)', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 5, value: 20 }], 1);
    // Old layer-0-only behavior would have reported last: 1.
    expect(dataBounds(chart)).toEqual({ first: 1, last: 5 });
  });

  it('survives an empty layer 0 (data only on layer 1)', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(
      id,
      [
        { time: 3, value: 1 },
        { time: 7, value: 2 },
      ],
      1,
    );
    expect(dataBounds(chart)).toEqual({ first: 3, last: 7 });
  });
});

describe('ChartInstance default line colours', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('gives each separate line the next palette colour', () => {
    const palette = chart.getTheme().seriesColors;
    const first = chart.addSeries('line');
    const second = chart.addSeries('line');

    expect(chart.getSeriesColor(first)).toBe(chart.getTheme().line.color);
    expect(chart.getSeriesColor(second)).toBe(palette[1]);
  });

  it('starts a line after the slots a multi-layer line takes', () => {
    const palette = chart.getTheme().seriesColors;
    chart.addSeries('line', { layers: 3 });
    const single = chart.addSeries('line');

    expect(chart.getSeriesColor(single)).toBe(palette[3]);
  });

  it('gives a re-created line its free slot back instead of the next one', () => {
    const palette = chart.getTheme().seriesColors;
    const first = chart.addSeries('line');
    const second = chart.addSeries('line');

    chart.removeSeries(first);
    const recreated = chart.addSeries('line');

    expect(chart.getSeriesColor(recreated)).toBe(chart.getTheme().line.color);
    expect(chart.getSeriesColor(second)).toBe(palette[1]);
  });

  it('keeps the palette slot across a theme swap', () => {
    chart.addSeries('line');
    const second = chart.addSeries('line');

    chart.setTheme(githubLight.theme);

    expect(chart.getSeriesColor(second)).toBe(githubLight.theme.seriesColors[1]);
  });
});

describe('ChartInstance Y axis on a flat series', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('labels the axis around a constant value', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      [7, 7, 7, 7].map((value, i) => ({ time: i * 60_000, value })),
    );

    const { min, max } = chart.getYRange();
    expect(min).toBeLessThan(7);
    expect(max).toBeGreaterThan(7);
    expect(chart.yScale.niceTickValues().length).toBeGreaterThan(1);
  });

  it('shows no labels before any data', () => {
    chart.addSeries('line');

    expect(chart.yScale.niceTickValues()).toEqual([]);
  });
});

describe('ChartInstance percent stack snapshots', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  function percentStack(): string {
    const id = chart.addSeries('line', { layers: 2, stacking: 'percent' });
    chart.setSeriesData(
      id,
      [
        { time: 0, value: 1 },
        { time: 60_000, value: 3 },
      ],
      0,
    );
    chart.setSeriesData(
      id,
      [
        { time: 0, value: 3 },
        { time: 60_000, value: 1 },
      ],
      1,
    );

    return id;
  }

  it('gives each hovered layer its share and prints it before the value', () => {
    percentStack();

    const snapshots = buildHoverSnapshots(chart, { time: 60_000, cacheKey: 'percent' });

    expect(snapshots.map((s) => s.share)).toEqual([75, 25]);
    expect(formatRowValue(snapshots[0], (v) => String(v))).toBe('75% · 3');
  });

  it('gives the last-value rows their share too', () => {
    percentStack();

    const snapshots = buildLastSnapshots(chart, { cacheKey: 'percent-last' });

    expect(snapshots.map((s) => s.share)).toEqual([75, 25]);
  });

  it('lists no rows for a column whose layers sum to 0, as for a gap', () => {
    const id = chart.addSeries('line', { layers: 2, stacking: 'percent' });
    chart.setSeriesData(
      id,
      [
        { time: 0, value: 1 },
        { time: 60_000, value: 0 },
      ],
      0,
    );
    chart.setSeriesData(
      id,
      [
        { time: 0, value: 3 },
        { time: 60_000, value: 0 },
      ],
      1,
    );

    expect(buildHoverSnapshots(chart, { time: 60_000, cacheKey: 'zero' })).toEqual([]);
  });

  it('scales percent bars like the stack draws them: positives to 100%, negatives to -100%', () => {
    const id = chart.addSeries('bar', { layers: 3, stacking: 'percent' });
    chart.setSeriesData(id, [{ time: 0, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 0, value: -5 }], 1);
    chart.setSeriesData(id, [{ time: 0, value: -15 }], 2);

    const snapshots = buildHoverSnapshots(chart, { time: 0, cacheKey: 'bars' });

    expect(snapshots.map((s) => s.share)).toEqual([100, -25, -75]);
  });

  it('lists the rows of a percent bar column whose positives and negatives cancel out', () => {
    const id = chart.addSeries('bar', { layers: 2, stacking: 'percent' });
    chart.setSeriesData(id, [{ time: 0, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 0, value: -10 }], 1);

    const snapshots = buildHoverSnapshots(chart, { time: 0, cacheKey: 'cancel' });

    expect(snapshots.map((s) => s.share)).toEqual([100, -100]);
  });

  it("takes each last-value share against the row's own column", () => {
    // A is alone at the newest column, where B is a gap; B's last reading is one column earlier.
    const id = chart.addSeries('line', { layers: 2, stacking: 'percent' });
    chart.setSeriesData(
      id,
      [
        { time: 0, value: 30 },
        { time: 60_000, value: 30 },
      ],
      0,
    );
    chart.setSeriesData(
      id,
      [
        { time: 0, value: 70 },
        { time: 60_000, value: null },
      ],
      1,
    );

    const snapshots = buildLastSnapshots(chart, { cacheKey: 'ragged-last' });

    expect(snapshots.map((s) => [s.data.time, s.share])).toEqual([
      [60_000, 100],
      [0, 70],
    ]);
  });

  function easingStack(type: 'line' | 'bar'): string {
    const options = { layers: 2, stacking: 'percent' } as const;
    const id = type === 'line' ? chart.addSeries('line', options) : chart.addSeries('bar', options);
    for (const layer of [0, 1]) {
      chart.setSeriesData(
        id,
        [
          { time: 0, value: 1 },
          { time: 60_000, value: 1 },
        ],
        layer,
      );
    }

    return id;
  }

  for (const type of ['line', 'bar'] as const) {
    it(`${type}: takes shares from the values on screen while an update eases in`, () => {
      const id = easingStack(type);

      chart.updateData(id, { time: 60_000, value: 9 }, 0);
      const [first, second] = buildHoverSnapshots(chart, { time: 60_000, cacheKey: `${type}-easing` });
      const shown = [first, second].map((s) => ('value' in s.data ? s.data.value : Number.NaN));

      // The chart still draws the old 50/50 split; the rows must agree with it.
      expect(shown[0]).toBeLessThan(9);
      expect(first.share).toBeCloseTo((shown[0] / (shown[0] + shown[1])) * 100, 9);
    });

    it(`${type}: keeps the rows while a column eases down to a zero total`, () => {
      const id = easingStack(type);

      chart.updateData(id, { time: 60_000, value: 0 }, 0);
      chart.updateData(id, { time: 60_000, value: 0 }, 1);

      expect(buildHoverSnapshots(chart, { time: 60_000, cacheKey: `${type}-to-zero` })).toHaveLength(2);
    });
  }

  it('prints a plain value off a percent stack', () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.setSeriesData(id, [{ time: 0, value: 1 }], 0);
    chart.setSeriesData(id, [{ time: 0, value: 3 }], 1);

    const snapshots = buildHoverSnapshots(chart, { time: 0, cacheKey: 'plain' });

    expect(snapshots[0].share).toBeUndefined();
    expect(formatRowValue(snapshots[0], (v) => String(v))).toBe('1');
  });
});
