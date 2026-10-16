import { useEffect, useState } from 'react';

import { BarSeries, Crosshair, LineSeries, ReferenceLine, TimeAxis, YAxis, YLabel, logScale } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanvasRecorder, RecordedCall } from '../../../../core/src/testing/recording-context';
import { useChartInstance } from '../../context';
import { mountChart } from '../helpers/mount-chart';

/**
 * Price on the default right axis, RSI on a named left scale pinned to 0..100.
 * Geometry at the default 800×400 / dpr 1 mount: left column [0, 55), pane
 * [55, 745) × 370, right column [745, 800).
 */
describe('named Y scales', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const price = Array.from({ length: 30 }, (_, i) => ({ time: 1_000_000 + i * 60_000, value: 1000 + i * 10 }));
  const rsi = Array.from({ length: 30 }, (_, i) => ({ time: 1_000_000 + i * 60_000, value: 30 + (i % 5) * 10 }));
  const scales = { rsi: { position: 'left' as const, min: 0, max: 100 } };

  function styleOf(el: Element | null | undefined): CSSStyleDeclaration {
    if (!(el instanceof HTMLElement)) throw new Error('expected an HTMLElement');

    return el.style;
  }

  /** YAxis containers: the parents of the vertically-centred tick spans. */
  function yAxisHosts(container: HTMLElement): HTMLElement[] {
    const hosts = new Set<HTMLElement>();
    for (const span of container.querySelectorAll('span[style*="translateY(-50%)"]')) {
      if (span.parentElement) hosts.add(span.parentElement);
    }

    return [...hosts];
  }

  function fadeRects(spy: CanvasRecorder): RecordedCall[] {
    return spy.callsOf('fillRect').filter((c) => c.globalCompositeOperation === 'destination-out' && c.args[1] === 0);
  }

  function mountRsiChart() {
    return mountChart(
      <>
        <LineSeries data={price} />
        <LineSeries id="rsi" data={rsi} scale="rsi" />
        <YAxis />
        <YAxis scale="rsi" format={(v) => `${v}%`} />
        <TimeAxis />
        <Crosshair />
      </>,
      { scales },
    );
  }

  it('renders a YAxis column per side, each labelling its own scale', () => {
    mounted = mountRsiChart();
    mounted.flushScheduler();

    const hosts = yAxisHosts(mounted.container);
    expect(hosts).toHaveLength(2);

    const left = hosts.find((host) => host.style.left === '0px');
    const right = hosts.find((host) => host.style.right === '0px');
    expect(left?.style.width).toBe('55px');
    expect(right?.style.width).toBe('55px');
    expect(left?.textContent).toContain('100%');
    expect(right?.textContent).not.toContain('%');

    const timeHost = styleOf(mounted.container.querySelector('span[style*="translateX(-50%)"]')?.parentElement);
    expect(timeHost.left).toBe('55px');
    expect(timeHost.right).toBe('55px');
  });

  it('shows a crosshair value label on both sides, each from its own scale', () => {
    mounted = mountRsiChart();

    // Halfway down the 370px plot: 50 on the pinned RSI scale.
    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 185 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const pills = [...mounted.container.querySelectorAll('div[style*="translateY(-50%)"][style*="z-index: 2"]')];
    const leftPill = pills.find((pill) => styleOf(pill).left === '0px');
    const rightPill = pills.find((pill) => styleOf(pill).right === '0px');
    expect(leftPill?.textContent).toBe('50%');

    const priceAtCursor = mounted.chart.yScale.formatY(mounted.chart.yScale.yToValue(185));
    expect(rightPill?.textContent).toBe(priceAtCursor);
  });

  it('places a YLabel and a ReferenceLine on the named scale', () => {
    mounted = mountChart(
      <>
        <LineSeries data={price} />
        <LineSeries id="rsi" data={rsi} scale="rsi" />
        <YLabel seriesId="rsi" />
        <ReferenceLine value={70} scale="rsi" color="#00ff00" />
      </>,
      { scales },
    );
    mounted.overlaySpy.reset();
    mounted.flushScheduler();

    const rsiScale = mounted.chart.getYScale('rsi');
    const last = rsi[rsi.length - 1].value;
    const badge = styleOf(mounted.container.querySelector('div[style*="z-index: 3"][style*="translateY(-50%)"]'));
    expect(badge.left).toBe('4px');
    expect(Number.parseFloat(badge.top)).toBeCloseTo(rsiScale.valueToY(last), 3);

    const guide = styleOf(mounted.container.querySelector('div[style*="dashed"]'));
    expect(guide.left).toBe('55px');
    expect(guide.right).toBe('55px');

    const lineYs = mounted.overlaySpy
      .callsOf('moveTo')
      .filter((c) => c.strokeStyle === '#00ff00')
      .map((c) => Number(c.args[1]));
    expect(lineYs.length).toBeGreaterThan(0);
    expect(lineYs[0]).toBeCloseTo(rsiScale.valueToBitmapY(70), -0.5);
  });

  it("formats the YLabel badge with its scale's YAxis formatter, and follows a change", () => {
    const chartOf = (format: (v: number) => string) => (
      <>
        <LineSeries data={price} />
        <LineSeries id="rsi" data={rsi} scale="rsi" />
        <YAxis scale="rsi" format={format} />
        <YLabel seriesId="rsi" animate={false} />
      </>
    );
    mounted = mountChart(
      chartOf((v) => `${v.toFixed(0)}%`),
      { scales },
    );
    mounted.flushScheduler();

    const badge = () => mounted?.container.querySelector('div[style*="z-index: 3"][style*="translateY(-50%)"]');
    expect(badge()?.textContent).toContain('%');

    mounted.rerender(chartOf((v) => `${v.toFixed(0)} pts`));
    mounted.flushScheduler();
    expect(badge()?.textContent).toContain('pts');
  });

  it('moves the YAxis columns when two scales swap sides at equal widths', () => {
    const swapped = { a: { position: 'right' as const }, b: { position: 'left' as const } };
    const children = (
      <>
        <LineSeries data={price} scale="a" />
        <LineSeries data={rsi} scale="b" />
        <YAxis scale="a" />
        <YAxis scale="b" />
      </>
    );
    const hidden = { y: { visible: false } };
    mounted = mountChart(children, { axis: hidden, scales: { a: { position: 'left' }, b: { position: 'right' } } });
    mounted.flushScheduler();

    // The axis containers in render order — `a`'s first. Tick labels fade in on
    // the real clock, so the containers' own anchors are what this reads.
    const columns = () =>
      [...(mounted?.container.querySelectorAll('div') ?? [])]
        .filter((div) => div.style.width === '55px' && div.style.pointerEvents === 'none')
        .map((div) => (div.style.left === '0px' ? 'left' : 'right'));
    expect(columns()).toEqual(['left', 'right']);

    mounted.rerender(children, { axis: hidden, scales: swapped });
    mounted.flushScheduler();
    expect(columns()).toEqual(['right', 'left']);
  });

  it('moves a percent stack off a log axis in one render without throwing', () => {
    const logAxis = { y: { scale: logScale() } };
    const linear = { lin: {} };
    const bars = price.map((p) => ({ time: p.time, value: 10 + (p.value % 7) }));
    mounted = mountChart(<BarSeries data={bars} options={{ stacking: 'normal' }} />, { axis: logAxis, scales: linear });

    expect(() => {
      mounted?.rerender(<BarSeries data={bars} scale="lin" options={{ stacking: 'percent' }} />, {
        axis: logAxis,
        scales: linear,
      });
      mounted?.flushScheduler();
    }).not.toThrow();
  });

  it('settles after one pointer move when crosshair state re-renders an inline YAxis formatter', () => {
    // Every crosshair move sets state, and every render hands YAxis a fresh formatter.
    function CursorState() {
      const chart = useChartInstance();
      const [, setCursor] = useState<unknown>(null);
      useEffect(() => {
        chart.on('crosshairMove', setCursor);

        return () => chart.off('crosshairMove', setCursor);
      }, [chart]);

      return <YAxis format={(v) => v.toFixed(1)} />;
    }
    mounted = mountChart(
      <>
        <LineSeries data={price} />
        <CursorState />
        <Crosshair />
      </>,
    );

    expect(() => {
      mounted?.dispatchMouse('mousemove', { clientX: 300, clientY: 185 }, mounted.overlayCanvas);
      mounted?.flushScheduler();
    }).not.toThrow();
  });

  it('re-labels a still crosshair when the axis formatter changes', () => {
    const chartOf = (unit: string) => (
      <>
        <LineSeries data={price} />
        <YAxis format={(v) => `${v.toFixed(0)}${unit}`} />
        <Crosshair />
      </>
    );
    mounted = mountChart(chartOf(' a'));
    mounted.dispatchMouse('mousemove', { clientX: 300, clientY: 185 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const pill = () => mounted?.container.querySelector('div[style*="translateY(-50%)"][style*="z-index: 2"]');
    expect(pill()?.textContent?.endsWith(' a')).toBe(true);

    mounted.rerender(chartOf(' b'));
    mounted.flushScheduler();
    expect(pill()?.textContent?.endsWith(' b')).toBe(true);
  });

  it('keeps the slide-under fade on the right and the left-axis treatment on the left', () => {
    mounted = mountChart(
      <>
        <LineSeries data={price} />
        <LineSeries data={rsi} scale="rsi" />
      </>,
      { scales },
    );

    // Right: a 60px ramp ending 12px into the right column (x = 757).
    const rects = fadeRects(mounted.mainSpy);
    expect(rects.some((c) => c.args[0] === 697 && c.args[2] === 60)).toBe(true);
    // Left: the data ramp ends at the pane edge.
    expect(rects.some((c) => c.args[0] === 55 && c.args[2] === 60)).toBe(true);
    // Gridlines run 12px under the left column.
    expect(mounted.mainSpy.callsOf('moveTo').some((c) => c.args[0] === -12)).toBe(true);
  });
});
