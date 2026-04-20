import { CandlestickSeries, InfoBar, LineSeries, Tooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Phase B: `InfoBar` and `Tooltip` expose a children-fn slot. Removing the
 * `seriesId` filter pushes filtering into user code — these tests pin the
 * slot contract:
 *   - Receives the same visible snapshots the default UI would render.
 *   - `isHover` on `InfoBar` tracks crosshair presence (last-mode otherwise).
 *   - `Tooltip` is hover-only (no invocation without crosshair).
 *   - Re-renders are driven by `overlayChange`; no render per `mousemove`
 *     inside one data point.
 */

const OHLC = Array.from({ length: 10 }, (_, i) => ({
  time: (i + 1) * 60_000,
  open: 100 + i,
  high: 110 + i,
  low: 90 + i,
  close: 105 + i,
}));

const MULTI_LINE = [
  Array.from({ length: 10 }, (_, i) => ({ time: (i + 1) * 60_000, value: 10 + i })),
  Array.from({ length: 10 }, (_, i) => ({ time: (i + 1) * 60_000, value: 20 + i })),
];

describe('<InfoBar> children-fn slot', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('invokes the render-prop with last-mode snapshots and `isHover: false` when no cursor is over the chart', () => {
    const seenCalls: Array<{ snapshotCount: number; isHover: boolean }> = [];

    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar>
          {({ snapshots, isHover }) => {
            seenCalls.push({ snapshotCount: snapshots.length, isHover });
            return (
              <div data-testid="custom-bar">
                {snapshots.map((s) => (
                  <span key={s.id} data-series={s.seriesId}>
                    {s.seriesId}
                  </span>
                ))}
              </div>
            );
          }}
        </InfoBar>
      </>,
    );

    const bar = mounted.container.querySelector('[data-testid="custom-bar"]');
    expect(bar, 'custom slot content rendered').not.toBeNull();
    // Slot was called at least once with snapshots and `isHover: false`
    const lastCall = seenCalls[seenCalls.length - 1];
    expect(lastCall.snapshotCount).toBe(MULTI_LINE.length);
    expect(lastCall.isHover).toBe(false);

    // Default UI markers (dot-prefixed value cells) should be absent — the
    // slot replaces the whole layout.
    expect(mounted.container.querySelectorAll('span[style*="border-radius: 50%"]').length).toBe(0);
  });

  it('switches to hover-mode snapshots when the cursor enters the plot', () => {
    const captured: Array<{ snapshots: readonly { seriesId: string }[]; isHover: boolean }> = [];

    mounted = mountChart(
      <>
        <CandlestickSeries data={OHLC} />
        <InfoBar>
          {(ctx) => {
            captured.push({ snapshots: ctx.snapshots, isHover: ctx.isHover });

            return <div data-testid="custom-bar">{ctx.snapshots.length}</div>;
          }}
        </InfoBar>
      </>,
    );

    mounted.dispatchMouse('mousemove', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    // At least one call after hover must report isHover=true.
    expect(captured.some((c) => c.isHover)).toBe(true);
    // Always at least one snapshot — the OHLC fixture has ten points so the
    // hover lookup never misses.
    expect(captured.every((c) => c.snapshots.length > 0)).toBe(true);
  });

  it('falls back to the built-in UI when no children-fn is supplied', () => {
    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar />
      </>,
    );
    // Built-in UI emits the dot marker for each line snapshot.
    const dots = mounted.container.querySelectorAll('[data-tooltip-legend] span[style*="border-radius: 50%"]');
    expect(dots.length).toBe(MULTI_LINE.length);
  });
});

describe('<InfoBar> hover-gap fallback (y-axis hover regression)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  // Regression: the overlay canvas includes the y-axis strip, so a mousemove
  // in that region fires `crosshairMove` with a time past the plotted data.
  // `buildHoverSnapshots` then returns an empty array (every series'
  // `findNearest` misses), and InfoBar used to short-circuit with
  // `return null` — blinking out every time the pointer grazed the y-axis.
  // The fix falls back to last-mode snapshots so the bar stays populated.
  it('stays visible when the crosshair time is far past the last data point', () => {
    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar />
      </>,
      { width: 400, height: 240 },
    );

    // Extreme offsetX → xToTime extrapolates well beyond last_time + interval,
    // so every series' `getDataAtTime` returns null.
    mounted.dispatchMouse('mousemove', { clientX: 10000, clientY: 100 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const crosshair = mounted.chart.getCrosshairPosition();
    expect(crosshair, 'mousemove must have registered a crosshair').not.toBeNull();
    // Pre-condition for the regression: this crosshair time is beyond any
    // series' nearest lookup radius — if the bug were present the bar would
    // render `null` at this point.
    const lastTime = Math.max(...MULTI_LINE.flatMap((layer) => layer.map((p) => p.time)));
    expect(crosshair!.time).toBeGreaterThan(lastTime + mounted.chart.getDataInterval());

    const bar = mounted.container.querySelector('[data-tooltip-legend]');
    expect(bar, 'InfoBar must stay mounted — last-mode fallback fills the gap').not.toBeNull();
  });

  it('falls back to last-mode values (isHover=false) when hover returns empty', () => {
    const captured: Array<{ count: number; isHover: boolean; crosshairTime: number | undefined }> = [];
    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar>
          {({ snapshots, isHover, time }) => {
            captured.push({ count: snapshots.length, isHover, crosshairTime: time });

            return <div data-testid="custom-bar" data-hover={isHover ? 'y' : 'n'} />;
          }}
        </InfoBar>
      </>,
      { width: 400, height: 240 },
    );

    mounted.dispatchMouse('mousemove', { clientX: 10000, clientY: 100 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    // At least one render must correspond to the "hover miss" case — crosshair
    // is active (position non-null) but `buildHoverSnapshots` returned empty,
    // so the fallback reports `isHover=false` with a full last-mode snapshot
    // list. Without the fix that render would simply not happen (`return null`
    // in InfoBar), and the bar would be gone from the DOM.
    expect(captured.every((c) => c.count === MULTI_LINE.length)).toBe(true);
    expect(captured.some((c) => !c.isHover)).toBe(true);
  });
});

describe('<Tooltip> children-fn slot', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('does not invoke the render-prop when there is no crosshair (hover-only contract)', () => {
    const renderProp = vi.fn(() => <div data-testid="custom-tooltip">content</div>);

    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <Tooltip>{renderProp}</Tooltip>
      </>,
    );
    expect(renderProp).not.toHaveBeenCalled();
    expect(mounted.container.querySelector('[data-testid="custom-tooltip"]')).toBeNull();
  });

  it('invokes the render-prop on hover with the computed snapshots, and positions the container', () => {
    const renderProp = vi.fn(({ snapshots }: { snapshots: readonly { seriesId: string }[] }) => (
      <div data-testid="custom-tooltip">
        {snapshots.map((s) => (
          <span key={s.seriesId}>{s.seriesId}</span>
        ))}
      </div>
    ));

    mounted = mountChart(
      <>
        <CandlestickSeries data={OHLC} />
        <Tooltip>{renderProp}</Tooltip>
      </>,
    );

    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 150 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    expect(renderProp).toHaveBeenCalled();
    const node = mounted.container.querySelector<HTMLElement>('[data-testid="custom-tooltip"]');
    expect(node, 'custom tooltip rendered').not.toBeNull();
    // Outer container is the one we set `data-measured` on.
    const container = node!.parentElement as HTMLElement;
    expect(container.style.position).toBe('absolute');
  });
});

describe('slot `time` is order-independent', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('<InfoBar> last-mode time stays at max(snapshot.time) regardless of `sort`', () => {
    // Two series with identical time grids — stagger the values so `sort`
    // reorders index-0 between runs. If `time` were derived from index 0
    // the returned value would swap with sort; with the max rule it doesn't.
    let timeAsc: number | undefined;
    let timeDesc: number | undefined;

    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar sort="asc">{({ time }) => ((timeAsc = time), (<div data-testid="asc" />))}</InfoBar>
      </>,
    );
    mounted.unmount();

    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar sort="desc">{({ time }) => ((timeDesc = time), (<div data-testid="desc" />))}</InfoBar>
      </>,
    );

    expect(timeAsc).toBeDefined();
    expect(timeDesc).toBeDefined();
    expect(timeAsc).toBe(timeDesc);
    // Max of the fixture timestamps (10 * 60_000).
    expect(timeAsc).toBe(10 * 60_000);
  });

  it('<Tooltip> slot receives `crosshair.time`, independent of `snapshots[0].data.time`', () => {
    // `crosshair.time` is the raw hover moment; `snapshots[0].data.time` is
    // the nearest data point. These disagree whenever the cursor is between
    // points. The slot contract is: `time` is the hover moment, not the
    // index-0 snapshot — so users who filter the snapshots still get a
    // consistent hover time.
    let slotTime: number | undefined;

    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <Tooltip sort="desc">
          {(ctx) => {
            slotTime = ctx.time;

            return <div data-testid="t" />;
          }}
        </Tooltip>
      </>,
    );

    mounted.dispatchMouse('mousemove', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const crosshair = mounted.chart.getCrosshairPosition();
    expect(crosshair, 'hover should have set the crosshair').not.toBeNull();
    expect(slotTime).toBe(crosshair!.time);
  });
});

describe('slot-driven re-renders are gated by overlayChange', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('passes the same `snapshots` array reference across `mousemove` events landing on the same point', () => {
    const refs: Array<readonly unknown[]> = [];

    mounted = mountChart(
      <>
        <LineSeries data={MULTI_LINE} />
        <InfoBar>
          {({ snapshots }) => {
            refs.push(snapshots);

            return <div data-testid="bar">{snapshots.length}</div>;
          }}
        </InfoBar>
      </>,
    );

    // Two mousemoves that resolve to the same nearest data time must produce
    // the same frozen `snapshots` reference — this is what makes
    // `React.memo((a, b) => a.snapshots === b.snapshots)` worthwhile.
    // Using identical coordinates guarantees the crosshair time doesn't drift
    // between calls, so the structural-equality cache returns the same slot.
    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    const refAfterFirst = refs[refs.length - 1];

    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    const refAfterSecond = refs[refs.length - 1];

    expect(refAfterFirst).toBe(refAfterSecond);
  });
});
