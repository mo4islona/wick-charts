import { ChartInstance } from '@wick-charts/core';
import { CandlestickSeries, Title } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanvasRecorder, RecordedCall } from '../../../../core/src/testing/recording-context';
import { mountChart } from '../helpers/mount-chart';

/**
 * Integration coverage for the edge fade masks (`fade` prop → `chart.setFade`).
 * Each mask must be an alpha *erase* (`destination-out`) — not a painted-over
 * background color — so it stays correct when the container background is a
 * CSS gradient. Assertions therefore key on the composite operation of the
 * recorded `fillRect`, not on any particular fill color.
 *
 * Geometry at the default 800×400 / dpr 1 mount: pane = 745×370 (55px Y-axis
 * column, 30px time-axis row), so the top mask spans the full 800px width and
 * the right mask fills the [745, 800) column strip. The X masks run the full
 * 400px bitmap height so the below-pane gridline tail stubs (their taper is
 * the one destination-out fill anchored at y = 370) melt at the edges too.
 */
describe('edge fade masks', () => {
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

  /** Every mask erase, excluding the below-pane gridline-tail taper — the
   *  masks are anchored at y = 0 while the taper fills the axis-row strip. */
  function fadeRects(spy: CanvasRecorder): RecordedCall[] {
    return spy.callsOf('fillRect').filter((c) => c.globalCompositeOperation === 'destination-out' && c.args[1] === 0);
  }

  /** Top mask: anchored at the origin and spanning the full bitmap width. */
  function topFadeRects(spy: CanvasRecorder, bitmapWidth: number): RecordedCall[] {
    return fadeRects(spy).filter((c) => c.args[0] === 0 && c.args[2] === bitmapWidth);
  }

  /** Right mask: the only erase pass anchored past the pane's left edge. */
  function rightFadeRects(spy: CanvasRecorder): RecordedCall[] {
    return fadeRects(spy).filter((c) => (c.args[0] as number) > 0);
  }

  /** The gridline-tail taper: a destination-out fill over the below-pane
   *  strip, anchored at the pane floor. */
  function tailTaperRects(spy: CanvasRecorder, paneBitmapHeight: number): RecordedCall[] {
    return spy
      .callsOf('fillRect')
      .filter((c) => c.globalCompositeOperation === 'destination-out' && c.args[1] === paneBitmapHeight);
  }

  it('headerless default: no top mask, X mask rides under the axis column', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    expect(topFadeRects(mounted.mainSpy, 800)).toHaveLength(0);

    // Auto ramp = 48px in-pane lead-in + 12px end gap: starts at 697 inside
    // the pane and completes at 757 — before the axis label glyphs. Full
    // bitmap height, so the gridline tail stubs melt with their lines.
    const rects = rightFadeRects(mounted.mainSpy);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[rects.length - 1].args).toEqual([697, 0, 60, 400]);
  });

  it('the right mask erases nothing at the pane edge and everything at the canvas edge', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    const rects = rightFadeRects(mounted.mainSpy);
    const last = rects[rects.length - 1];
    expect(last.fillStyle).toContain('gradient(linear');
    expect(last.fillStyle).toContain('0:rgba(0, 0, 0, 0)');
    expect(last.fillStyle).toContain('1:rgba(0, 0, 0, 1)');
  });

  it('widens the pane clip by the X intrusion so content can reach under the axis', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    // The clip rect spans pane + the 12px end gap when the X fade is armed —
    // content past the completed ramp is total-erased anyway, so the clip
    // stops with it…
    const clipRects = mounted.mainSpy.callsOf('rect').filter((c) => c.args[3] === 370);
    expect(clipRects.some((c) => c.args[2] === 757)).toBe(true);

    // …and shrinks back to the bare pane once every mask is off.
    mounted.mainSpy.reset();
    mounted.chart.setFade({ top: 0, right: 0, left: 0 });
    mounted.flushScheduler();

    const strictRects = mounted.mainSpy.callsOf('rect').filter((c) => c.args[3] === 370);
    expect(strictRects.length).toBeGreaterThan(0);
    expect(strictRects.every((c) => c.args[2] === 745)).toBe(true);
  });

  it('fade={{right}} overrides the intrusion depth and 0 disables it', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      fade: { right: 20 },
    });

    // Explicit width keeps the same end anchor (pane + 12px gap), so a 20px
    // ramp runs [737, 757).
    const rects = rightFadeRects(mounted.mainSpy);
    expect(rects[rects.length - 1].args).toEqual([737, 0, 20, 400]);

    mounted.mainSpy.reset();
    mounted.chart.setFade({ right: 0 });
    mounted.flushScheduler();

    expect(rightFadeRects(mounted.mainSpy)).toHaveLength(0);
  });

  it('fade={{left}} erases a strip at the left pane edge', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      fade: { left: 32 },
    });

    const rects = fadeRects(mounted.mainSpy).filter((c) => c.args[0] === 0 && c.args[2] === 32);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[rects.length - 1].args).toEqual([0, 0, 32, 400]);
  });

  it('runs the vertical gridline stubs past the pane floor with an opacity taper', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    // The taper is a destination-out fill over the below-pane strip: 9px
    // deep, anchored at the 370px pane floor, spanning the bitmap width.
    const tapers = tailTaperRects(mounted.mainSpy, 370);
    expect(tapers.length).toBeGreaterThan(0);
    const last = tapers[tapers.length - 1];
    expect(last.args).toEqual([0, 370, 800, 9]);

    // Nothing erased at the pane floor, total erase at the stub tip.
    expect(last.fillStyle).toContain('gradient(linear');
    expect(last.fillStyle).toContain('0:rgba(0, 0, 0, 0)');
    expect(last.fillStyle).toContain('1:rgba(0, 0, 0, 1)');
  });

  it('skips the gridline stubs when the grid is hidden', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      grid: { visible: false },
    });

    expect(tailTaperRects(mounted.mainSpy, 370)).toHaveLength(0);
  });

  it('skips the gridline stubs when the time axis is hidden — nothing to point at', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      axis: { x: { visible: false } },
    });

    // With the axis row gone the pane spans the full 400px bitmap height.
    expect(tailTaperRects(mounted.mainSpy, 400)).toHaveLength(0);
  });

  it('hides the X mask when the Y axis is hidden — no column to ride under', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      axis: { y: { visible: false } },
    });

    expect(rightFadeRects(mounted.mainSpy)).toHaveLength(0);
  });

  it('erases an explicit top zone with a top-anchored alpha gradient, after the series', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      fade: { top: 80 },
    });

    const rects = topFadeRects(mounted.mainSpy, 800);
    expect(rects.length).toBeGreaterThan(0);

    // Zone geometry: full bitmap width, exactly the configured height (dpr 1).
    const last = rects[rects.length - 1];
    expect(last.args).toEqual([0, 0, 800, 80]);

    // The mask ramp erases fully at the top edge and not at all at the zone
    // bottom. The recorder serializes gradients with their stops, so the
    // endpoints are assertable without pinning the interior easing curve.
    expect(last.fillStyle).toContain('gradient(linear');
    expect(last.fillStyle).toContain('0:rgba(0, 0, 0, 1)');
    expect(last.fillStyle).toContain('1:rgba(0, 0, 0, 0)');

    // The erase passes are the frame's final fillRects — nothing repaints
    // over them in default compositing afterward.
    const calls = mounted.mainSpy.calls;
    const all = fadeRects(mounted.mainSpy);
    const lastFadeIndex = calls.lastIndexOf(all[all.length - 1]);
    const after = calls.slice(lastFadeIndex + 1).filter((c) => c.method === 'fillRect' || c.method === 'stroke');
    for (const call of after) {
      expect(call.globalCompositeOperation).toBe('source-over');
    }
  });

  it('applies and clears the top zone live through setFade', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });

    mounted.mainSpy.reset();
    mounted.chart.setFade({ top: 40 });
    mounted.flushScheduler();

    const withFade = topFadeRects(mounted.mainSpy, 800);
    expect(withFade.length).toBeGreaterThan(0);
    expect(withFade[withFade.length - 1].args).toEqual([0, 0, 800, 40]);

    mounted.mainSpy.reset();
    mounted.chart.setFade({ top: 0 });
    mounted.flushScheduler();

    expect(mounted.mainSpy.countOf('fillRect')).toBeGreaterThan(0);
    expect(topFadeRects(mounted.mainSpy, 800)).toHaveLength(0);
  });

  it('fade={true} without a header falls back to the 24px top run-out band', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      fade: true,
    });

    const rects = topFadeRects(mounted.mainSpy, 800);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[rects.length - 1].args).toEqual([0, 0, 800, 24]);
  });

  it('clamps an oversized top zone to the pane height', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      fade: { top: 5000 },
    });

    // Pane = container height minus the default 30px time-axis row.
    const rects = topFadeRects(mounted.mainSpy, 800);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[rects.length - 1].args).toEqual([0, 0, 800, 370]);
  });

  it('top mask stays off by default, header or not — only the X mask is armed', () => {
    mounted = mountChart(
      <>
        <Title>BTC</Title>
        <CandlestickSeries data={data} />
      </>,
      { width: 800, height: 400 },
    );

    expect(topFadeRects(mounted.mainSpy, 800)).toHaveLength(0);
    expect(rightFadeRects(mounted.mainSpy).length).toBeGreaterThan(0);
  });

  it('fade={true} with a header enables the auto top zone', () => {
    mounted = mountChart(
      <>
        <Title>BTC</Title>
        <CandlestickSeries data={data} />
      </>,
      { width: 800, height: 400, fade: true },
    );

    // Auto zone = measured header (400, the rect-patch artifact) + 24,
    // clamped at draw time to the 370px pane.
    const rects = topFadeRects(mounted.mainSpy, 800);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[rects.length - 1].args).toEqual([0, 0, 800, 370]);
  });

  it('fade={false} turns every mask off, header or not', () => {
    mounted = mountChart(
      <>
        <Title>BTC</Title>
        <CandlestickSeries data={data} />
      </>,
      { width: 800, height: 400, fade: false },
    );

    expect(mounted.mainSpy.countOf('fillRect')).toBeGreaterThan(0);
    expect(fadeRects(mounted.mainSpy)).toHaveLength(0);
  });

  it('fade={true} releases half the measured header from the fold-in', () => {
    const setPadding = vi.spyOn(ChartInstance.prototype, 'setPadding');

    // The rect patch makes the overlay header measure as the full 400px
    // host, so half of it (200) must come off the fold-in: 20 + 400 - 200.
    mounted = mountChart(
      <>
        <Title>BTC</Title>
        <CandlestickSeries data={data} />
      </>,
      { width: 800, height: 400, fade: true },
    );

    const tops = setPadding.mock.calls.map((c) => c[0]?.top);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops[tops.length - 1]).toBe(20 + 400 - 200);
    setPadding.mockRestore();
  });

  it('fade overlap releases part of the header padding fold-in', () => {
    const setPadding = vi.spyOn(ChartInstance.prototype, 'setPadding');

    // mount-chart's rect patch makes the overlay header measure as the full
    // 400px host — a jsdom artifact, but a deterministic one: without
    // overlap the fold-in lands at 20 + 400, with overlap 15 at 20 + 385.
    mounted = mountChart(
      <>
        <Title>BTC</Title>
        <CandlestickSeries data={data} />
      </>,
      { width: 800, height: 400, fade: { overlap: 15 } },
    );

    const tops = setPadding.mock.calls.map((c) => c[0]?.top);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops[tops.length - 1]).toBe(20 + 400 - 15);
    setPadding.mockRestore();
  });

  it('a pure X config leaves the top mask on its header-driven default', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      fade: { right: 20 },
    });

    // Headerless chart + `{ right }` only: the top zone must stay off.
    expect(topFadeRects(mounted.mainSpy, 800)).toHaveLength(0);
  });

  it('scales the zones by the device pixel ratio', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, {
      width: 800,
      height: 400,
      dpr: 2,
      fade: { top: 80 },
    });

    const tops = topFadeRects(mounted.mainSpy, 1600);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops[tops.length - 1].args).toEqual([0, 0, 1600, 160]);

    // Right mask in bitmap px too: 96px lead-in + 24px end gap = 120 wide,
    // completing at 1514 (pane 1490 + gap).
    const rights = rightFadeRects(mounted.mainSpy);
    expect(rights.length).toBeGreaterThan(0);
    expect(rights[rights.length - 1].args).toEqual([1394, 0, 120, 800]);

    // Gridline stubs scale too: 18 bitmap px below the 740px pane floor.
    const tapers = tailTaperRects(mounted.mainSpy, 740);
    expect(tapers.length).toBeGreaterThan(0);
    expect(tapers[tapers.length - 1].args).toEqual([0, 740, 1600, 18]);
  });
});
