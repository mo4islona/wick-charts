import { afterEach, describe, expect, it, vi } from 'vitest';

import { RadarRenderer, niceRadarMax } from '../../series/radar';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { RadarData, RadarSeriesOptions } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const theme = catppuccin.theme;
const palette = theme.seriesColors;
const STILL: Partial<RadarSeriesOptions> = { entryMs: 0, updateMs: 0 };

const AXES = ['Speed', 'Power', 'Range', 'Comfort', 'Price'];
const DATA: RadarData = {
  axes: AXES,
  series: [
    { label: 'Big', data: [90, 80, 85, 70, 75] },
    { label: 'Small', data: [30, 25, 20, 35, 30] },
  ],
};

function radar(options: Partial<RadarSeriesOptions> = {}): RadarRenderer {
  return new RadarRenderer({ options: { ...STILL, ...options }, theme });
}

function renderOnce(r: RadarRenderer, opts: Parameters<typeof buildRenderContext>[0] = {}) {
  const built = buildRenderContext({ mediaWidth: 600, mediaHeight: 600, ...opts });
  r.render(built.ctx);

  return built.spy;
}

type Spy = ReturnType<typeof renderOnce>;

function textsOf(spy: Spy): string[] {
  return spy.callsOf('fillText').map((call) => String(call.args[0]));
}

function strokedIn(spy: Spy, color: string): number {
  return spy.callsOf('stroke').filter((call) => call.strokeStyle === color).length;
}

/** The web's center (where every spoke starts) and radius (where the longest one ends). */
function webOf(spy: Spy, gridColor: string): { cx: number; cy: number; radius: number } {
  const moves = spy.callsOf('moveTo').filter((call) => call.strokeStyle === gridColor);
  const counts = new Map<string, number>();
  for (const call of moves) {
    const key = (call.args as number[]).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const [center] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [cx, cy] = center[0].split(',').map(Number);
  const lines = spy.callsOf('lineTo').filter((call) => call.strokeStyle === gridColor);
  const radius = Math.max(
    ...lines.map((call) => Math.hypot((call.args[0] as number) - cx, (call.args[1] as number) - cy)),
  );

  return { cx, cy, radius };
}

/** The global test setup reports `prefers-reduced-motion: reduce`; tween tests swap in a motion-allowing one. */
const reducedMotionStub = globalThis.matchMedia;

function allowMotion(): void {
  globalThis.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.matchMedia = reducedMotionStub;
});

describe('niceRadarMax', () => {
  it('rounds the top up so every ring step is round', () => {
    expect(niceRadarMax({ min: 0, top: 93, rings: 4 })).toBe(100);
    expect(niceRadarMax({ min: 0, top: 8.7, rings: 4 })).toBe(10);
    expect(niceRadarMax({ min: 0, top: 41, rings: 5 })).toBe(50);
    expect(niceRadarMax({ min: 0, top: 100, rings: 4 })).toBe(100);
  });

  it('gives a flat or empty series a unit step per ring', () => {
    expect(niceRadarMax({ min: 0, top: 0, rings: 4 })).toBe(4);
  });
});

describe('RadarRenderer — layout', () => {
  it('draws every axis name and a value per ring on the first spoke', () => {
    const r = radar();
    r.setData(DATA);
    const texts = textsOf(renderOnce(r));

    for (const axis of AXES) {
      expect(texts).toContain(axis);
    }
    expect(texts).toEqual(expect.arrayContaining(['25', '50', '75', '100']));
  });

  it('labels the rings on an explicit scale', () => {
    const r = radar({ min: 0, max: 10, rings: 5 });
    r.setData({ axes: AXES, series: [{ label: 'A', data: [2, 4, 6, 8, 10] }] });
    const texts = textsOf(renderOnce(r));

    expect(texts).toEqual(expect.arrayContaining(['2', '4', '6', '8', '10']));
    expect(texts).not.toContain('12');
  });

  it('puts the axis names outside the web and inside the box', () => {
    const r = radar({ gridColor: '#123456', ringLabels: false });
    r.setData(DATA);
    const spy = renderOnce(r);
    const { cx, cy, radius } = webOf(spy, '#123456');

    for (const call of spy.callsOf('fillText')) {
      const [, x, y] = call.args as number[];
      expect(Math.hypot(x - cx, y - cy)).toBeGreaterThan(radius);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(600);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(600);
    }
  });

  it('shrinks the web for long axis names', () => {
    const radiusWith = (axes: string[]) => {
      const r = radar({ gridColor: '#123456' });
      r.setData({ axes, series: [{ label: 'A', data: axes.map(() => 50) }] });

      return webOf(renderOnce(r), '#123456').radius;
    };

    const short = radiusWith(['A', 'B', 'C', 'D']);
    const long = radiusWith(['A', 'B rather long name', 'C', 'D rather long name']);

    expect(long).toBeLessThan(short);
  });

  it('draws circles for a circle grid and polygons otherwise', () => {
    const r = radar({ gridColor: '#123456', gridShape: 'circle', rings: 3 });
    r.setData(DATA);
    const circles = renderOnce(r)
      .callsOf('arc')
      .filter((call) => call.strokeStyle === '#123456');

    expect(circles.length).toBeGreaterThanOrEqual(3);

    const polygonal = radar({ gridColor: '#123456', rings: 3 });
    polygonal.setData(DATA);
    const arcs = renderOnce(polygonal)
      .callsOf('arc')
      .filter((call) => call.strokeStyle === '#123456');

    expect(arcs).toHaveLength(0);
  });

  it('draws nothing without axes', () => {
    const r = radar();
    r.setData({ axes: [], series: [] });
    const spy = renderOnce(r);

    expect(spy.countOf('stroke')).toBe(0);
    expect(r.hitTest(300, 300)).toBe(-1);
  });
});

describe('RadarRenderer — colors', () => {
  it('takes the grid, the labels and the polygons from the theme', () => {
    const r = radar();
    r.setData(DATA);
    const spy = renderOnce(r);

    expect(strokedIn(spy, theme.grid.color)).toBeGreaterThan(0);
    expect(strokedIn(spy, palette[0])).toBeGreaterThan(0);
    expect(strokedIn(spy, palette[1])).toBeGreaterThan(0);
    expect(spy.callsOf('fillText').some((call) => call.fillStyle === theme.axis.textColor)).toBe(true);
  });

  it('lets every color be overridden', () => {
    const r = radar({ colors: ['#aa0000'], gridColor: '#00aa00', labelColor: '#0000aa' });
    r.setData({ ...DATA, series: [DATA.series[0], { ...DATA.series[1], color: '#bb00bb' }] });
    const spy = renderOnce(r);

    expect(strokedIn(spy, '#aa0000')).toBeGreaterThan(0);
    expect(strokedIn(spy, '#bb00bb')).toBeGreaterThan(0);
    expect(strokedIn(spy, '#00aa00')).toBeGreaterThan(0);
    expect(strokedIn(spy, theme.grid.color)).toBe(0);
    expect(spy.callsOf('fillText').every((call) => call.fillStyle === '#0000aa')).toBe(true);
    expect(r.getLayerColors()).toEqual(['#aa0000', '#bb00bb']);
  });

  it('starts at the palette slot the chart hands it', () => {
    const r = new RadarRenderer({ options: STILL, theme, paletteIndex: 2 });
    r.setData(DATA);

    expect(r.getLayerColors()).toEqual([palette[2], palette[3]]);
  });

  it('follows a theme swap', () => {
    const r = radar();
    r.setData(DATA);
    r.applyTheme({ ...theme, seriesColors: ['#010203', '#040506'] });

    expect(r.getLayerColors()).toEqual(['#010203', '#040506']);
  });
});

describe('RadarRenderer — data', () => {
  it('reports one layer per series, named by its label', () => {
    const r = radar();
    r.setData(DATA);

    expect(r.getLayerCount()).toBe(2);
    expect(r.getLayerLabel(0)).toBe('Big');
    expect(r.getLayerLabel(1)).toBe('Small');
  });

  it('puts a null vertex on the center without a dot', () => {
    const dotsFor = (data: (number | null)[]) => {
      const r = radar({ colors: ['#aa0000'], dotRadius: 3 });
      r.setData({ axes: AXES, series: [{ label: 'A', data }] });

      return renderOnce(r)
        .callsOf('arc')
        .filter((call) => call.strokeStyle === '#aa0000').length;
    };

    expect(dotsFor([50, 50, 50, 50, 50])).toBe(5);
    expect(dotsFor([50, null, 50, Number.NaN, 50])).toBe(3);
  });

  it('warns once about a row whose length differs from the axes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = radar();
    r.setData({ axes: AXES, series: [{ label: 'Short', data: [1, 2] }] });
    r.setData({ axes: AXES, series: [{ label: 'Short', data: [1, 2] }] });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Short');
    expect(r.getData().series[0].data).toEqual([1, 2, null, null, null]);
  });

  it('morphs a kept layer, grows a new one and collapses a dropped one', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
    const r = radar({ updateMs: 400 });
    r.setData(DATA);
    renderOnce(r);
    expect(r.needsAnimation).toBe(false);

    r.setData({
      axes: AXES,
      series: [
        { label: 'Small', data: [60, 60, 60, 60, 60] },
        { label: 'New', data: [10, 10, 10, 10, 10] },
      ],
    });

    expect(r.getLayerCount()).toBe(2);
    expect(r.getLayerLabel(0)).toBe('Small');
    expect(r.needsAnimation).toBe(true);

    renderOnce(r);
    now += 500;
    renderOnce(r);
    now += 16;
    renderOnce(r);

    expect(r.needsAnimation).toBe(false);
    expect(r.getData().series.map((layer) => layer.label)).toEqual(['Small', 'New']);
  });

  it('replays the entry when the axes change', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
    const r = radar({ entryMs: 600 });
    r.setData(DATA);
    for (let frame = 0; frame <= 40; frame++) {
      renderOnce(r);
      now += 16;
    }
    expect(r.needsAnimation).toBe(false);

    r.setData({ axes: ['A', 'B', 'C'], series: [{ label: 'Big', data: [1, 2, 3] }] });

    expect(r.needsAnimation).toBe(true);
  });
});

describe('RadarRenderer — entry', () => {
  it('grows the polygons from the center and settles at the end', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
    const r = radar({ entryMs: 1000, colors: ['#aa0000'] });
    r.setData({ axes: AXES, series: [{ label: 'A', data: [100, 100, 100, 100, 100] }] });

    const extentAt = () => {
      const spy = renderOnce(r, { mediaWidth: 600, mediaHeight: 600 });
      const ys = spy
        .callsOf('lineTo')
        .filter((call) => call.strokeStyle === '#aa0000')
        .map((call) => call.args[1] as number);

      return Math.max(...ys) - Math.min(...ys);
    };

    const play = (ms: number) => {
      for (let t = 0; t < ms; t += 16) {
        now += 16;
        extentAt();
      }
    };

    const first = extentAt();
    play(400);
    const middle = extentAt();
    play(700);
    const settled = extentAt();

    expect(first).toBe(0);
    expect(middle).toBeGreaterThan(0);
    expect(settled).toBeGreaterThan(middle);
    expect(r.needsAnimation).toBe(false);
  });

  it('paints at once under reduced motion', () => {
    const r = radar({ entryMs: 1000, updateMs: 400 });
    r.setData(DATA);

    expect(r.needsAnimation).toBe(false);
  });
});

describe('RadarRenderer — entry clock', () => {
  it('pauses over a stalled frame instead of jumping ahead', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
    const r = radar({ entryMs: 1000 });
    r.setData(DATA);
    renderOnce(r);

    now += 900;
    renderOnce(r);

    expect(r.needsAnimation).toBe(true);
  });
});

describe('RadarRenderer — hover', () => {
  function hovered(): { r: RadarRenderer; cx: number; cy: number; radius: number } {
    const r = radar({ gridColor: '#123456' });
    r.setData(DATA);
    const { cx, cy, radius } = webOf(renderOnce(r), '#123456');

    return { r, cx, cy, radius };
  }

  it('picks the smallest polygon under the pointer', () => {
    const { r, cx, cy, radius } = hovered();

    expect(r.hitTest(cx, cy)).toBe(1);
    // Between the small and the big polygon on the first (upward) axis.
    expect(r.hitTest(cx, cy - radius * 0.6)).toBe(0);
    expect(r.hitTest(cx, cy - radius * 1.2)).toBe(-1);
  });

  it('keeps the hovered polygon under the pointer when the layers reorder', () => {
    const { r, cx, cy } = hovered();
    r.setHoverIndex(r.hitTest(cx, cy));
    expect(r.getHoverInfo(theme)?.label).toBe('Small');

    r.setData({ axes: AXES, series: [DATA.series[1], DATA.series[0]] });

    // The chart re-runs the hit test on a data change, before the next frame.
    const index = r.hitTest(cx, cy);
    r.setHoverIndex(index);
    expect(index).toBe(0);
    expect(r.getHoverInfo(theme)?.label).toBe('Small');
  });

  it('gives every axis value of the hovered polygon', () => {
    const { r, cx, cy } = hovered();

    expect(r.getHoverInfo(theme)).toBeNull();
    expect(r.setHoverIndex(r.hitTest(cx, cy))).toBe(true);
    expect(r.setHoverIndex(1)).toBe(false);

    const info = r.getHoverInfo(theme);
    expect(info?.label).toBe('Small');
    expect(info?.color).toBe(palette[1]);
    expect(info?.value).toBe(28);
    expect(info?.rows).toEqual(
      AXES.map((label, i) => {
        const value = DATA.series[1].data[i] ?? 0;

        return { label, value, percent: value };
      }),
    );
  });

  it('lifts the hovered polygon with its vertex values and a glow, and dims the rest', () => {
    const { r } = hovered();
    r.setHoverIndex(0);
    const spy = renderOnce(r);

    const big = spy.callsOf('stroke').filter((call) => call.strokeStyle === palette[0]);
    const small = spy.callsOf('stroke').filter((call) => call.strokeStyle === palette[1]);
    expect(big.some((call) => call.shadowBlur > 0)).toBe(true);
    expect(Math.max(...small.map((call) => call.globalAlpha))).toBeLessThan(0.5);

    const pills = spy.callsOf('fillText').filter((call) => call.textAlign === 'center' && call.font.startsWith('600'));
    expect(pills.map((call) => call.args[0])).toEqual(['90', '80', '85', '70', '75']);
  });

  it('hides the ring values under the hover values', () => {
    const { r } = hovered();
    r.setHoverIndex(0);
    const texts = textsOf(renderOnce(r));

    expect(texts).not.toContain('25');
    expect(texts).toContain('90');
  });

  it('keeps the ring values when hover values are off', () => {
    const r = radar({ hoverValues: false });
    r.setData(DATA);
    r.setHoverIndex(0);

    expect(textsOf(renderOnce(r))).toContain('25');
  });

  it('draws no vertex values or glow when they are off', () => {
    const r = radar({ hoverValues: false, glow: false });
    r.setData(DATA);
    r.setHoverIndex(0);
    const spy = renderOnce(r);

    expect(spy.callsOf('stroke').some((call) => call.shadowBlur > 0)).toBe(false);
    expect(textsOf(spy)).not.toContain('90');
  });
});

describe('RadarRenderer — visibility', () => {
  it('collapses a hidden layer and leaves it out of the hit test', () => {
    const r = radar({ gridColor: '#123456' });
    r.setData(DATA);
    const { cx, cy } = webOf(renderOnce(r), '#123456');

    r.setLayerVisible(1, false);
    r.setLayerAlpha(1, 0, 0);
    const spy = renderOnce(r);

    expect(r.isLayerVisible(1)).toBe(false);
    expect(r.getLayerAlpha(1)).toBe(0);
    expect(strokedIn(spy, palette[1])).toBe(0);
    expect(r.hitTest(cx, cy)).toBe(0);
  });

  it('fades the whole series with setAlpha', () => {
    const r = radar();
    r.setData(DATA);
    r.setAlpha(0, 0);

    expect(r.getAlpha()).toBe(0);
  });
});

describe('RadarRenderer — intro directives', () => {
  it('clips a partial reveal and draws the scan beam', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
    const r = radar({ entryMs: 1000, introAnimation: () => ({ reveal: 0.5 }) });
    r.setData(DATA);
    renderOnce(r);
    now += 16;
    const spy = renderOnce(r);

    expect(spy.countOf('clip')).toBeGreaterThan(0);
    expect(spy.callsOf('stroke').some((call) => call.strokeStyle === theme.line.color)).toBe(true);
  });

  it('turns and fades a polygon as told', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
    const r = radar({
      entryMs: 1000,
      colors: ['#aa0000'],
      introAnimation: () => ({ rotation: Math.PI / 2, alpha: 0.5 }),
    });
    r.setData({ axes: AXES, series: [{ label: 'A', data: [100, 0, 0, 0, 0] }] });
    renderOnce(r);
    now += 16;
    const spy = renderOnce(r, { mediaWidth: 600, mediaHeight: 600 });

    const outline = spy.callsOf('stroke').find((call) => call.strokeStyle === '#aa0000');
    expect(outline?.globalAlpha).toBeCloseTo(0.5);

    // The first axis points up; a quarter turn moves its vertex to the right of the center.
    const lines = spy.callsOf('moveTo').filter((call) => call.strokeStyle === '#aa0000');
    const xs = lines.map((call) => call.args[0] as number);
    expect(Math.max(...xs)).toBeGreaterThan(400);
  });
});
