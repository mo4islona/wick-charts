import { CandlestickSeries, Crosshair, TimeAxis, Title, YAxis, YLabel } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanvasRecorder, RecordedCall } from '../../../../core/src/testing/recording-context';
import { mountChart } from '../helpers/mount-chart';

/**
 * `axis.y.position: 'left'` mirrors the layout: the 55px axis column moves to
 * the left, the pane shifts right by it, and every pixel↔value conversion
 * (canvas, pointer, DOM overlays) accounts for the offset.
 *
 * Geometry at the default 800×400 / dpr 1 mount: column = [0, 55), pane =
 * [55, 800) × 370. The canvas draws the pane in translated, pane-local
 * coordinates, so clip rects and hairlines below are pane-local while the
 * fade masks (drawn untranslated) are in canvas coordinates.
 */
describe('left Y axis', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data = Array.from({ length: 30 }, (_, i) => ({
    time: 1_000_000 + i * 60_000,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
  }));

  const leftAxis = { y: { position: 'left' as const } };

  function fadeRects(spy: CanvasRecorder): RecordedCall[] {
    return spy.callsOf('fillRect').filter((c) => c.globalCompositeOperation === 'destination-out' && c.args[1] === 0);
  }

  function styleOf(el: Element | null | undefined): CSSStyleDeclaration {
    if (!(el instanceof HTMLElement)) throw new Error('expected an HTMLElement');

    return el.style;
  }

  /** The YAxis container: the parent of the vertically-centred tick spans. */
  function yAxisHost(container: HTMLElement): HTMLElement | null {
    const span = container.querySelector('span[style*="translateY(-50%)"]');

    return span?.parentElement ?? null;
  }

  /** The TimeAxis container: the parent of the horizontally-centred tick spans. */
  function timeAxisHost(container: HTMLElement): HTMLElement | null {
    const span = container.querySelector('span[style*="translateX(-50%)"]');

    return span?.parentElement ?? null;
  }

  it('reports the plot area offset by the axis width', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    expect(mounted.chart.yAxisPosition).toBe('left');
    expect(mounted.chart.plotLeft).toBe(55);
    expect(mounted.chart.getLayout().chartArea).toEqual({ x: 55, y: 0, width: 745, height: 370 });
  });

  it('draws the pane translated past the axis column', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    expect(mounted.mainSpy.callsOf('translate').some((c) => c.args[0] === 55 && c.args[1] === 0)).toBe(true);
  });

  // Data scrolls out through the left edge, and renderers draw only one point
  // past the visible range — a clip reaching under the column would show that
  // lone segment and cut it off each time a point leaves (a jittering tail).
  it('clips at the pane edge and fades out fully there while older data sits off-screen', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    // Default 60px ramp, entirely in the pane: none at x = 115, total at the
    // pane edge (x = 55). The gradient is memoized, so read it off the first paint.
    const gradients = mounted.mainSpy.callsOf('createLinearGradient');
    expect(gradients.some((c) => c.args[0] === 115 && c.args[2] === 55)).toBe(true);

    mounted.chart.setVisibleRange(10);
    mounted.mainSpy.reset();
    mounted.flushScheduler();

    // The data clips at the pane edge; only the grid pass reaches under the column.
    const clips = mounted.mainSpy.callsOf('rect').filter((c) => c.args[3] === 370);
    const dataClips = clips.filter((c) => c.args[0] === 0 && c.args[2] === 745);
    const gridClips = clips.filter((c) => c.args[0] === -12 && c.args[2] === 757);
    expect(dataClips.length).toBeGreaterThan(0);
    expect(dataClips.length + gridClips.length).toBe(clips.length);

    const rects = fadeRects(mounted.mainSpy);
    expect(rects.some((c) => c.args[0] === 55 && c.args[2] === 60)).toBe(true);

    // Nothing erased at the right edge by default — no column there.
    expect(rects.some((c) => (c.args[0] as number) >= 745)).toBe(false);
  });

  it('fade={{ left }} sizes the axis ramp, fade={{ right }} adds a plain right-edge zone', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis, fade: { left: 20, right: 40 } });

    const rects = fadeRects(mounted.mainSpy);
    expect(rects.some((c) => c.args[0] === 55 && c.args[2] === 20)).toBe(true);
    expect(rects.some((c) => c.args[0] === 760 && c.args[2] === 40)).toBe(true);

    // The right-edge zone erases totally at the canvas edge.
    const gradients = mounted.mainSpy.callsOf('createLinearGradient');
    expect(gradients.some((c) => c.args[0] === 800 && c.args[2] === 760)).toBe(true);
  });

  // The data ramp finishes at the pane edge; fading the grid with it would
  // leave the lines stopping short of their labels.
  it('lays the gridlines under the data and tapers them 12px into the column', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    const gridStarts = mounted.mainSpy.callsOf('moveTo').filter((c) => c.args[0] === -12);
    expect(gridStarts.length).toBeGreaterThan(0);
    expect(gridStarts.every((c) => c.globalCompositeOperation === 'destination-over')).toBe(true);

    // Taper strip [43, 55): nothing erased at the pane edge, total at x = 43.
    expect(fadeRects(mounted.mainSpy).some((c) => c.args[0] === 43 && c.args[2] === 12)).toBe(true);
    const gradients = mounted.mainSpy.callsOf('createLinearGradient');
    expect(gradients.some((c) => c.args[0] === 55 && c.args[2] === 43)).toBe(true);
  });

  it('keeps a right-axis grid in the data pass', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);

    const behind = mounted.mainSpy.callsOf('moveTo').filter((c) => c.globalCompositeOperation === 'destination-over');
    expect(behind).toEqual([]);
  });

  it('runs the gridline tail stubs under the pane, not under the axis column', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    const stubs = mounted.mainSpy.callsOf('moveTo').filter((c) => c.args[1] === 370);
    expect(stubs.length).toBeGreaterThan(0);
    expect(stubs.every((c) => (c.args[0] as number) >= 55)).toBe(true);
  });

  it('maps the pointer through the offset pane', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    mounted.overlaySpy.reset();
    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 200 }, mounted.overlayCanvas);

    const pos = mounted.chart.getCrosshairPosition();
    expect(pos?.mediaX).toBe(300);
    expect(pos?.time).toBeCloseTo(mounted.chart.timeScale.xToTime(245), 6);

    // Pane-local hairlines: the vertical one at x = 245, the horizontal one
    // from 12px under the column, where it tapers out like the gridlines.
    const moveTos = mounted.overlaySpy.callsOf('moveTo');
    const lineTos = mounted.overlaySpy.callsOf('lineTo');
    expect(lineTos.some((c) => c.args[0] === 245.5 && c.args[1] === 400)).toBe(true);
    expect(moveTos.some((c) => c.args[0] === -12 && c.args[1] === 200.5)).toBe(true);
    expect(fadeRects(mounted.overlaySpy).some((c) => c.args[0] === 43 && c.args[2] === 12)).toBe(true);
  });

  it('a pointer over the left axis column keeps only the horizontal hairline', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    mounted.overlaySpy.reset();
    mounted.dispatchMouse('mousemove', { clientX: 20, clientY: 200 }, mounted.overlayCanvas);

    const lineTos = mounted.overlaySpy.callsOf('lineTo');
    expect(lineTos.some((c) => c.args[1] === 400)).toBe(false);
    expect(lineTos.some((c) => c.args[1] === 200.5)).toBe(true);
  });

  it('setCrosshair projects the time into container coordinates', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { axis: leftAxis });

    const time = 1_000_000 + 15 * 60_000;
    mounted.chart.setCrosshair({ time, y: 110 });

    expect(mounted.chart.getCrosshairPosition()?.mediaX).toBeCloseTo(55 + mounted.chart.timeScale.timeToX(time), 6);
  });

  it('anchors the axis overlays to the left column', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={data} />
        <YAxis />
        <TimeAxis />
        <YLabel />
        <Crosshair />
      </>,
      { axis: leftAxis },
    );
    mounted.flushScheduler();

    const yHost = styleOf(yAxisHost(mounted.container));
    expect(yHost.left).toBe('0px');
    expect(yHost.right).toBe('');
    expect(yHost.width).toBe('55px');

    // Tick labels hug the outer (left) edge — the mirror of the right axis.
    const tick = styleOf(mounted.container.querySelector('span[style*="translateY(-50%)"]'));
    expect(tick.left).toBe('8px');
    expect(tick.right).toBe('');

    const timeHost = styleOf(timeAxisHost(mounted.container));
    expect(timeHost.left).toBe('55px');
    expect(timeHost.right).toBe('0px');

    // YLabel: the dashed guide spans the pane, the badge sits in the column.
    const guide = styleOf(mounted.container.querySelector('div[style*="dashed"]'));
    expect(guide.left).toBe('55px');
    expect(guide.right).toBe('0px');
    const badge = styleOf(mounted.container.querySelector('div[style*="z-index: 3"][style*="translateY(-50%)"]'));
    expect(badge.left).toBe('4px');
    expect(badge.right).toBe('');

    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    const pill = styleOf(mounted.container.querySelector('div[style*="translateY(-50%)"][style*="z-index: 2"]'));
    expect(pill.left).toBe('0px');
  });

  it('pins the overlay header to the left edge and reports its height to the chart', () => {
    mounted = mountChart(
      <>
        <Title>BTC/USD</Title>
        <CandlestickSeries data={data} />
      </>,
      { axis: leftAxis },
    );
    mounted.flushScheduler();

    const header = mounted.container.querySelector('[data-chart-top-overlay]');
    expect(styleOf(header).left).toBe('0px');
    expect(styleOf(header).right).toBe('0px');
    expect(mounted.chart.headerHeight).toBe(header?.getBoundingClientRect().height);
  });

  it('fades out the left-axis labels that rise under the header', () => {
    const children = (
      <>
        <CandlestickSeries data={data} />
        <YAxis />
      </>
    );
    mounted = mountChart(children, { axis: leftAxis });
    mounted.flushScheduler();
    mounted.chart.setHeaderHeight(150);
    mounted.flushScheduler();

    const labels = () => Array.from(mounted?.container.querySelectorAll('span[style*="translateY(-50%)"]') ?? []);
    const opacityOf = (el: Element) => styleOf(el).opacity;
    const topOf = (el: Element) => Number.parseFloat(styleOf(el).top);
    const under = labels().filter((el) => topOf(el) < 130);
    const clear = labels().filter((el) => topOf(el) > 170);
    expect(under.length).toBeGreaterThan(0);
    expect(clear.length).toBeGreaterThan(0);
    expect(under.every((el) => opacityOf(el) === '0')).toBe(true);
    expect(clear.every((el) => opacityOf(el) === '1')).toBe(true);

    // On the right the header and the labels don't share a column.
    mounted.rerender(children, { axis: { y: { position: 'right' } } });
    mounted.flushScheduler();

    expect(labels().every((el) => opacityOf(el) === '1')).toBe(true);
  });

  it('flips the overlays when the position changes at runtime', () => {
    const children = (
      <>
        <CandlestickSeries data={data} />
        <YAxis />
        <TimeAxis />
      </>
    );
    mounted = mountChart(children, { axis: leftAxis });
    mounted.flushScheduler();

    mounted.rerender(children, { axis: { y: { position: 'right' } } });
    mounted.flushScheduler();

    expect(mounted.chart.plotLeft).toBe(0);

    const yHost = styleOf(yAxisHost(mounted.container));
    expect(yHost.right).toBe('0px');
    expect(yHost.left).toBe('');

    const tick = styleOf(mounted.container.querySelector('span[style*="translateY(-50%)"]'));
    expect(tick.right).toBe('8px');
    expect(tick.left).toBe('');

    const timeHost = styleOf(timeAxisHost(mounted.container));
    expect(timeHost.left).toBe('0px');
    expect(timeHost.right).toBe('55px');
  });
});
