import { PieSeries, PieTooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * `<Title>` reserves space at the top of the chart by feeding its measured
 * height into `chart.setPadding({ top })`. Time-series renderers absorb that
 * via the YScale's value range, but `PieRenderer` is purely spatial — without
 * the explicit shift we landed in `core/series/pie.ts`, the pie would paint
 * over the title and stay anchored to the canvas midline.
 *
 * Driving the regression directly through `<Title>` is unreliable in
 * happy-dom (the layout engine doesn't compute the overlay's height, so the
 * ResizeObserver-driven padding effect never fires). Instead we set
 * `padding.top` on `<ChartContainer>` to simulate exactly what `<Title>`
 * would request and assert the renderer reacts. The `<Title>` ↔ padding
 * wiring is covered separately in `title.test.tsx`.
 */
describe('<PieSeries> + chart top-padding — pie shifts down', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const slices = [
    { label: 'Alpha', value: 40 },
    { label: 'Beta', value: 60 },
  ];

  // Recording-context's `callsOf` shape — kept narrow on purpose so the test
  // doesn't reach into private spy internals. We use the *last* recorded arc:
  // the spy accumulates across paint passes, so a `rerender` adds new arcs on
  // top of the originals — the freshest render is at the tail.
  type Spy = { callsOf: (m: string) => Array<{ args: unknown[] }> };
  function arcCenterY(spy: unknown): number {
    const arcs = (spy as Spy).callsOf('arc');
    if (arcs.length === 0) throw new Error('no arc() calls recorded — did the pie render?');
    return arcs[arcs.length - 1].args[1] as number;
  }

  it('pie center sits at the canvas midline with no top padding (regression baseline)', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} />, {
      width: 400,
      height: 400,
      padding: { top: 0, bottom: 0 },
    });
    expect(arcCenterY(mounted.mainSpy)).toBeCloseTo(200, 0);
  });

  it('top padding pushes the pie center downward by half the reservation', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} />, {
      width: 400,
      height: 400,
      padding: { top: 80, bottom: 0 },
    });
    // Usable height = 400 - 80 = 320, cy = 80 + 160 = 240.
    expect(arcCenterY(mounted.mainSpy)).toBeCloseTo(240, 0);
  });

  it('reactively re-centers when padding.top changes after mount', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} />, {
      width: 400,
      height: 400,
      padding: { top: 0, bottom: 0 },
    });
    expect(arcCenterY(mounted.mainSpy)).toBeCloseTo(200, 0);

    // Simulate Title appearing later (its ResizeObserver bumps padding.top).
    mounted.rerender(<PieSeries id="pie" data={slices} />, { padding: { top: 120, bottom: 0 } });
    // Usable height = 280, cy = 120 + 140 = 260.
    expect(arcCenterY(mounted.mainSpy)).toBeCloseTo(260, 0);
  });

  it('hover hit-test follows the shifted center — tooltip resolves at the painted cy', () => {
    mounted = mountChart(
      <>
        <PieSeries id="pie" data={slices} />
        <PieTooltip seriesId="pie" />
      </>,
      { width: 400, height: 400, padding: { top: 100, bottom: 0 } },
    );
    const cy = arcCenterY(mounted.mainSpy);

    // With dpr=1 (mountChart default), arc cy is also CSS-pixel y. Driving a
    // mousemove at the painted center proves render and hitTest agree on
    // geometry — without the fix, hitTest would still anchor at y=200 and
    // miss the visible pie.
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: cy }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const text = mounted.container.textContent ?? '';
    expect(text.includes('Alpha') || text.includes('Beta')).toBe(true);
  });
});
