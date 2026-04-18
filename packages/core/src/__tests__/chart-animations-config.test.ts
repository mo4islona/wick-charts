/**
 * Covers the chart-level `animations` toggle in two layers:
 *   1. {@link resolveAnimationsConfig} — pure mapping from public surface to gates.
 *   2. {@link ChartInstance} — confirms the gates propagate to series defaults
 *      by observing a renderer's behavior (no entry registered on append when
 *      entrance animations are disabled at the chart level).
 */
import { describe, expect, it } from 'vitest';

import { ChartInstance, resolveAnimationsConfig } from '../chart';
import type { CandlestickRenderer } from '../series/candlestick';
import type { LineRenderer } from '../series/line';

describe('resolveAnimationsConfig', () => {
  it('defaults to both gates on when undefined', () => {
    expect(resolveAnimationsConfig(undefined)).toEqual({ entrance: true, liveTracking: true });
  });

  it('true is equivalent to undefined', () => {
    expect(resolveAnimationsConfig(true)).toEqual({ entrance: true, liveTracking: true });
  });

  it('false disables every gate', () => {
    expect(resolveAnimationsConfig(false)).toEqual({ entrance: false, liveTracking: false });
  });

  it('partial object fills missing keys with defaults', () => {
    expect(resolveAnimationsConfig({ entrance: false })).toEqual({
      entrance: false,
      liveTracking: true,
    });
    expect(resolveAnimationsConfig({ liveTracking: false })).toEqual({
      entrance: true,
      liveTracking: false,
    });
  });
});

describe('ChartInstance.animations propagation', () => {
  function make(animations?: boolean | { entrance?: boolean; liveTracking?: boolean; zoom?: boolean }): {
    chart: ChartInstance;
    container: HTMLElement;
  } {
    const container = document.createElement('div');
    return { chart: new ChartInstance(container, { animations }), container };
  }

  /**
   * Observe gate propagation via renderer behavior: entrance creates an entry
   * map entry iff entrance animations are enabled; liveSmoothRate=0 snaps
   * displayedLast immediately iff live-tracking is disabled.
   */
  function addAndAppendCandle(chart: ChartInstance): { hasEntry: boolean; snappedOnUpdate: boolean } {
    const id = chart.addCandlestickSeries();
    const entry = (
      chart as unknown as {
        listSeriesForTest: () => Array<{ id: string; renderer: CandlestickRenderer }>;
      }
    )
      .listSeriesForTest()
      .find((s) => s.id === id)!;
    const r = entry.renderer;
    r.setData([{ time: 10, open: 10, high: 12, low: 9, close: 11 }]);
    r.appendPoint({ time: 20, open: 10, high: 12, low: 9, close: 11 });
    const hasEntry = (r as unknown as { entries: Map<number, unknown> }).entries.size > 0;

    // Seed displayedLast at the pre-update values, THEN update, THEN advance by
    // one frame — this is the only sequence that distinguishes "smoothing on"
    // (displayedLast partway between 11 and 18) from "smoothing off, snapped"
    // (displayedLast === 18 immediately).
    const advance = (t: number) =>
      (r as unknown as { advanceLiveTracking: (t: number) => void }).advanceLiveTracking(t);
    advance(1);
    r.updateLastPoint({ time: 20, open: 10, high: 18, low: 9, close: 18 });
    advance(17);
    const dl = (r as unknown as { displayedLast: { close: number } }).displayedLast;
    // When smoothing is disabled (rate=0), displayedLast snaps to target.
    const snappedOnUpdate = dl.close === 18;

    return { hasEntry, snappedOnUpdate };
  }

  function addLineAndAppend(chart: ChartInstance): { hasEntry: boolean } {
    const id = chart.addLineSeries();
    const entry = (
      chart as unknown as {
        listSeriesForTest: () => Array<{ id: string; renderer: LineRenderer }>;
      }
    )
      .listSeriesForTest()
      .find((s) => s.id === id)!;
    const r = entry.renderer;
    r.setData([
      { time: 10, value: 5 },
      { time: 20, value: 6 },
    ]);
    r.appendPoint({ time: 30, value: 8 });
    const hasEntry = (r as unknown as { entries: Array<Map<number, unknown>> }).entries[0].size > 0;

    return { hasEntry };
  }

  it('default: entrance registers an entry; live-tracking smooths', () => {
    const { chart } = make();
    const { hasEntry, snappedOnUpdate } = addAndAppendCandle(chart);
    expect(hasEntry).toBe(true);
    expect(snappedOnUpdate).toBe(false);
  });

  it('animations: false disables entrance and live-tracking', () => {
    const { chart } = make(false);
    const { hasEntry, snappedOnUpdate } = addAndAppendCandle(chart);
    expect(hasEntry).toBe(false);
    expect(snappedOnUpdate).toBe(true);
  });

  it('animations: { entrance: false } only disables entrance', () => {
    const { chart } = make({ entrance: false });
    const { hasEntry, snappedOnUpdate } = addAndAppendCandle(chart);
    expect(hasEntry).toBe(false);
    expect(snappedOnUpdate).toBe(false);
  });

  it('animations: { liveTracking: false } only disables live-tracking', () => {
    const { chart } = make({ liveTracking: false });
    const { hasEntry, snappedOnUpdate } = addAndAppendCandle(chart);
    expect(hasEntry).toBe(true);
    expect(snappedOnUpdate).toBe(true);
  });

  it('line series also respects the entrance gate', () => {
    const { chart } = make(false);
    const { hasEntry } = addLineAndAppend(chart);
    expect(hasEntry).toBe(false);
  });

  it('explicit series option wins over chart-level disable', () => {
    const { chart } = make(false);
    const id = chart.addCandlestickSeries({ enterAnimation: 'fade', liveSmoothRate: 14 });
    const entry = (
      chart as unknown as {
        listSeriesForTest: () => Array<{ id: string; renderer: CandlestickRenderer }>;
      }
    )
      .listSeriesForTest()
      .find((s) => s.id === id)!;
    const r = entry.renderer;
    r.setData([{ time: 10, open: 10, high: 12, low: 9, close: 11 }]);
    r.appendPoint({ time: 20, open: 10, high: 12, low: 9, close: 11 });
    expect((r as unknown as { entries: Map<number, unknown> }).entries.size).toBeGreaterThan(0);
  });
});
