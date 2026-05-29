/**
 * Gesture priority on the X slot + autoscroll re-engagement off bridge's
 * logical lastXTarget. The legacy `cancelEntranceAnimations`-on-interact
 * regression covered by this file is gone with Phase 3 (entrance state
 * moved to AnimationEngine — gestures don't touch it).
 */
import { describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

/**
 * Gesture priority on the X slot. The engine's per-kind priority is
 * `gesture (3) > data_tick (1)`; a pan committed mid-streaming must take
 * the X slot away from any in-flight data_tick claim and ease the visual
 * to the gesture's logical destination rather than the streaming target.
 */
describe('gesture priority on the X slot', () => {
  function makeChartWithSize(): ChartInstance {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    container.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 400,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(container);

    return new ChartInstance(container, { animations: { axis: { x: { gesture: 0 } } } });
  }

  it('pan during a streaming append commits logical to the pan destination, not the stream target', () => {
    const INTERVAL = 60_000;
    const chart = makeChartWithSize();
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 20 }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 10 + i })),
    );

    const beforePanLogical = { ...chart.getVisibleRange() };

    // Streaming append — chart emits data_tick X targeting `lastTime + 3
    // INTERVAL`. With gesture preempting, the pan target overrides it.
    chart.appendData(id, { time: 1_000_000 + 20 * INTERVAL, value: 30 });
    // User pan a few intervals left.
    chart.pan(-2 * INTERVAL, 800);

    // viewport.logicalRange reflects the gesture commit; bridge.lastXTarget
    // matches, and chart.getVisibleRange (engine visual) snaps to it
    // because gestureMs=0 → engine zero-duration guard. The pan shifted
    // *backward* — if the data_tick had won the X slot, `from` would have
    // moved *forward* by the streaming pin offset, never below the
    // pre-pan logical.
    const after = chart.getVisibleRange();
    expect(after.from).toBeLessThan(beforePanLogical.from);
  });

  it('pan toggles autoScroll off when the gesture pushes dataEnd off-screen', () => {
    const INTERVAL = 60_000;
    const chart = makeChartWithSize();
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 20 }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 10 + i })),
    );

    expect(chart.getAutoScroll()).toBe(true);

    // Pan left far enough that the last data point falls off the right edge.
    chart.pan(-30 * INTERVAL, 800);

    expect(chart.getAutoScroll()).toBe(false);
  });
});

/**
 * Autoscroll re-engagement reads the bridge's *logical* lastXTarget, not
 * the eased visual. Re-engagement is strict: the viewport must land back
 * at the live-tail position (newTo ≈ dataEnd + paddingRight). Just
 * having dataEnd anywhere in the window is no longer enough — the
 * looser rule used to let any clamp-to-edge pan flip autoScroll back
 * on and streaming would visibly drag the viewport back to the tail.
 */
describe('autoscroll re-engagement reads logical, not visual', () => {
  function makeChartWithSize(): ChartInstance {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    container.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 400,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(container);

    return new ChartInstance(container, { animations: { axis: { x: { gesture: 0 } } } });
  }

  it('pan back to live-tail position re-engages autoScroll', () => {
    const INTERVAL = 60_000;
    const chart = makeChartWithSize();
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 20 }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 10 + i })),
    );

    // Snapshot the initial live-tail position — that's the only viewport
    // that re-engages autoScroll under the new strict rule.
    const live = chart.getVisibleRange();

    // Pan off-tail: autoScroll flips false.
    chart.pan(-30 * INTERVAL, 800);
    expect(chart.getAutoScroll()).toBe(false);

    // Pan back precisely the amount needed to land newTo back at the
    // live-tail position (dataEnd + paddingRight).
    const after = chart.getVisibleRange();
    const delta = live.to - after.to;
    chart.pan(delta, 800);

    expect(chart.getAutoScroll()).toBe(true);
  });

  it('pan back into the window but past the live-tail position keeps autoScroll off', () => {
    const INTERVAL = 60_000;
    const chart = makeChartWithSize();
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 20 }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 10 + i })),
    );

    chart.pan(-30 * INTERVAL, 800);
    expect(chart.getAutoScroll()).toBe(false);

    // Pan back, but stop short of (and past, after clamp) the live tail.
    // Old looser rule would have re-armed autoScroll the moment dataEnd
    // re-entered the window — that's the "slow return" path we removed.
    chart.pan(20 * INTERVAL, 800);

    expect(chart.getAutoScroll()).toBe(false);
  });
});
