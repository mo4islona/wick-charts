import { describe, expect, it, vi } from 'vitest';

import type { ChartInstance } from '../chart';
import { EMPTY_SYNC_STATE, type SeriesSyncState, syncSeriesLayer, toLayers } from '../data/sync';

/** Minimal mock — only the methods syncSeriesLayer calls. */
function mockChart() {
  return {
    setSeriesData: vi.fn(),
    updateData: vi.fn(),
    appendData: vi.fn(),
    keepLast: vi.fn(),
    batch: vi.fn((fn: () => void) => fn()),
  } as unknown as ChartInstance;
}

const point = (time: number) => ({ time, value: time });

describe('toLayers', () => {
  it('wraps a flat single-layer array into one unnamed layer', () => {
    const flat = [point(1), point(2), point(3)];

    const layers = toLayers(flat);

    expect(layers).toEqual([{ data: flat }]);
    expect(layers.length).toBe(1);
  });

  it('wraps each raw layer of a 2D array', () => {
    const a = [point(1), point(2)];
    const b = [point(3)];

    expect(toLayers([a, b])).toEqual([{ data: a }, { data: b }]);
  });

  it('passes a single named layer through as one layer', () => {
    const named = { label: 'Revenue', color: '#f00', data: [point(1), point(2)] };

    expect(toLayers(named)).toEqual([named]);
  });

  it('keeps named layers and wraps raw layers in a mixed array', () => {
    const named = { label: 'Costs', data: [point(3)] };
    const raw = [point(1), point(2)];

    expect(toLayers([raw, named])).toEqual([{ data: raw }, named]);
  });

  it('treats an empty array as a single empty layer', () => {
    expect(toLayers([])).toEqual([{ data: [] }]);
  });
});

describe('syncSeriesLayer', () => {
  it('full replace on first load (prev.len === 0)', () => {
    const chart = mockChart();
    const data = [point(1), point(2), point(3)];

    const next = syncSeriesLayer({ chart, id: 'a', data, prev: EMPTY_SYNC_STATE });

    expect(chart.setSeriesData).toHaveBeenCalledWith('a', data, undefined);
    expect(next).toEqual({ len: 3, firstTime: 1, lastTime: 3, data });
  });

  it('updates the last point when length/timestamps are unchanged and the middle is proven unchanged', () => {
    const chart = mockChart();
    const prevData = [point(1), point(2), point(3)];
    const data = [point(1), point(2), point(30)];
    const prev: SeriesSyncState = { len: 3, firstTime: 1, lastTime: 3, data: prevData };

    const next = syncSeriesLayer({ chart, id: 'a', data, prev });

    expect(chart.updateData).toHaveBeenCalledWith('a', point(30), undefined);
    expect(chart.setSeriesData).not.toHaveBeenCalled();
    expect(next.len).toBe(3);
  });

  it('falls back to setSeriesData when a middle value changed despite matching first/last timestamps', () => {
    // Regression: a same-length replacement with an edited middle point used
    // to take the cheap updateData(last) path whenever the boundary
    // timestamps still matched — silently leaving the edited middle stale on
    // screen. Proving the middle is unchanged before taking that path fixes it.
    const chart = mockChart();
    const prevData = [point(1), point(2), point(3)];
    const data = [point(1), { time: 2, value: 999 }, point(3)];
    const prev: SeriesSyncState = { len: 3, firstTime: 1, lastTime: 3, data: prevData };

    syncSeriesLayer({ chart, id: 'a', data, prev });

    expect(chart.setSeriesData).toHaveBeenCalledWith('a', data, undefined);
    expect(chart.updateData).not.toHaveBeenCalled();
  });

  it('falls back to setSeriesData on the very first same-length sync (no prior data to prove the middle against)', () => {
    const chart = mockChart();
    const data = [point(1), point(2), point(3)];
    // `prev.len` matches but `prev.data` is null (e.g. state constructed by
    // hand rather than returned from a prior syncSeriesLayer call).
    const prev: SeriesSyncState = { len: 3, firstTime: 1, lastTime: 3, data: null };

    syncSeriesLayer({ chart, id: 'a', data, prev });

    expect(chart.setSeriesData).toHaveBeenCalledWith('a', data, undefined);
    expect(chart.updateData).not.toHaveBeenCalled();
  });

  it('appends when a few new points are added (under the bulk threshold)', () => {
    const chart = mockChart();
    const data = [point(1), point(2), point(3), point(4)];
    const prev: SeriesSyncState = { len: 3, firstTime: 1, lastTime: 3, data: null };

    syncSeriesLayer({ chart, id: 'a', data, prev });

    expect(chart.appendData).toHaveBeenCalledTimes(1);
    expect(chart.appendData).toHaveBeenCalledWith('a', point(4), undefined);
  });

  it('bulk-replaces when more than 20 new points arrive in one tick', () => {
    const chart = mockChart();
    const prev: SeriesSyncState = { len: 1, firstTime: 0, lastTime: 0, data: null };
    const data = Array.from({ length: 30 }, (_, i) => point(i));

    syncSeriesLayer({ chart, id: 'a', data, prev });

    expect(chart.setSeriesData).toHaveBeenCalledWith('a', data, undefined);
    expect(chart.appendData).not.toHaveBeenCalled();
  });

  it('rolling-window slide uses appendData + keepLast (no Y-snapping setSeriesData)', () => {
    const chart = mockChart();
    // Same length, but the window slid forward one step: head dropped, tail added.
    const prev: SeriesSyncState = { len: 3, firstTime: 1, lastTime: 3, data: null };
    const data = [point(2), point(3), point(4)];

    const next = syncSeriesLayer({ chart, id: 'a', data, prev });

    expect(chart.appendData).toHaveBeenCalledWith('a', point(4), undefined);
    expect(chart.keepLast).toHaveBeenCalledWith('a', 3, undefined);
    expect(chart.setSeriesData).not.toHaveBeenCalled();
    expect(next).toEqual({ len: 3, firstTime: 2, lastTime: 4, data });
  });

  it('wraps the rolling-window append + trim in one chart.batch (single onDataChanged pass)', () => {
    const chart = mockChart();
    const prev: SeriesSyncState = { len: 3, firstTime: 1, lastTime: 3, data: null };

    syncSeriesLayer({ chart, id: 'a', data: [point(2), point(3), point(4)], prev });

    expect(chart.batch).toHaveBeenCalledTimes(1);
    // Both mutations ran inside the batch callback (the mock executes it
    // synchronously, so call order proves containment).
    const batchOrder = vi.mocked(chart.batch).mock.invocationCallOrder[0];
    expect(vi.mocked(chart.appendData).mock.invocationCallOrder[0]).toBeGreaterThan(batchOrder);
    expect(vi.mocked(chart.keepLast).mock.invocationCallOrder[0]).toBeGreaterThan(batchOrder);
  });

  it('wraps a multi-point tail burst in one chart.batch (one engine retarget per commit)', () => {
    const chart = mockChart();
    const prev: SeriesSyncState = { len: 1, firstTime: 1, lastTime: 1, data: null };

    syncSeriesLayer({ chart, id: 'a', data: [point(1), point(2), point(3), point(4)], prev });

    expect(chart.batch).toHaveBeenCalledTimes(1);
    expect(chart.appendData).toHaveBeenCalledTimes(3);
  });

  it('clears the series and resets state on empty data', () => {
    const chart = mockChart();
    const prev: SeriesSyncState = { len: 10, firstTime: 0, lastTime: 9, data: null };

    const next = syncSeriesLayer({ chart, id: 'a', data: [], prev });

    expect(chart.setSeriesData).toHaveBeenCalledWith('a', [], undefined);
    expect(next).toEqual({ len: 0, firstTime: null, lastTime: null, data: [] });
  });

  it('full-replaces after a clear → refill (no stale append index)', () => {
    const chart = mockChart();

    let state = syncSeriesLayer({ chart, id: 'a', data: [point(1), point(2), point(3)], prev: EMPTY_SYNC_STATE });
    state = syncSeriesLayer({ chart, id: 'a', data: [], prev: state });
    state = syncSeriesLayer({ chart, id: 'a', data: [point(10), point(20), point(30)], prev: state });

    expect(chart.setSeriesData).toHaveBeenLastCalledWith('a', [point(10), point(20), point(30)], undefined);
    expect(state.len).toBe(3);
  });

  it('threads layerIndex through every mutation', () => {
    const chart = mockChart();

    syncSeriesLayer({ chart, id: 'a', data: [point(1)], prev: EMPTY_SYNC_STATE, layerIndex: 2 });
    expect(chart.setSeriesData).toHaveBeenCalledWith('a', [point(1)], 2);

    syncSeriesLayer({
      chart,
      id: 'a',
      data: [point(1), point(2)],
      prev: { len: 1, firstTime: 1, lastTime: 1, data: null },
      layerIndex: 2,
    });
    expect(chart.appendData).toHaveBeenCalledWith('a', point(2), 2);
  });
});
