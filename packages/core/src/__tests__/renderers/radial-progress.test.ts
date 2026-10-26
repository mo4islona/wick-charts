import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RadialProgressRenderer } from '../../series/radial-progress';
import {
  type RadialLabelArgs,
  type RingPaintArgs,
  flyTicks,
  headTags,
  heroCenter,
  heroLayout,
  listCenter,
  popTicks,
  radarTicks,
  startLabels,
  tickRing,
} from '../../series/radial-progress-styles';
import type { RecordedCall } from '../../testing/recording-context';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { PieSliceInput, RadialProgressSeriesOptions } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const theme = catppuccin.theme;
const palette = theme.seriesColors;
const TRACK = '#111111';
const STILL: Partial<RadialProgressSeriesOptions> = { entryMs: 0, updateMs: 0, trackColor: TRACK };
const START = -Math.PI / 2;
const TURN = Math.PI * 2;

const RINGS: PieSliceInput[] = [
  { label: 'CPU', value: 72 },
  { label: 'Memory', value: 54 },
  { label: 'Disk', value: 31, color: '#00aaaa' },
];

function radial(options: Partial<RadialProgressSeriesOptions> = {}): RadialProgressRenderer {
  return new RadialProgressRenderer({ options: { ...STILL, ...options }, theme });
}

function renderOnce(r: RadialProgressRenderer, opts: Parameters<typeof buildRenderContext>[0] = {}) {
  const built = buildRenderContext(opts);
  r.render(built.ctx);

  return built.spy;
}

type Spy = ReturnType<typeof renderOnce>;

function arcsIn(spy: Spy, color: string): RecordedCall[] {
  return spy.callsOf('arc').filter((call) => call.strokeStyle === color);
}

/** `[cx, cy, radius, start, end]` of the one arc stroked in `color`. */
function arcIn(spy: Spy, color: string): number[] {
  const arcs = arcsIn(spy, color);
  if (arcs.length !== 1) throw new Error(`expected one arc in ${color}, got ${arcs.length}`);

  return arcs[0].args as number[];
}

describe('RadialProgressRenderer — rings', () => {
  it('draws one full-circle track and one progress arc per item, outermost first', () => {
    const r = radial();
    r.setData(RINGS);
    const spy = renderOnce(r);

    const tracks = arcsIn(spy, TRACK).map((call) => call.args as number[]);
    expect(tracks).toHaveLength(3);
    for (const [, , , start, end] of tracks) {
      expect(start).toBeCloseTo(START);
      expect(end).toBeCloseTo(START + TURN);
    }

    const radii = tracks.map((args) => args[2]);
    expect(radii[0]).toBeGreaterThan(radii[1]);
    expect(radii[1]).toBeGreaterThan(radii[2]);

    const cpu = arcIn(spy, palette[0]);
    const memory = arcIn(spy, palette[1]);
    const disk = arcIn(spy, '#00aaaa');
    expect([cpu[2], memory[2], disk[2]]).toEqual(radii);
    expect(cpu[3]).toBeCloseTo(START);
    expect(cpu[4]).toBeCloseTo(START + TURN * 0.72);
    expect(memory[4]).toBeCloseTo(START + TURN * 0.54);
    expect(disk[4]).toBeCloseTo(START + TURN * 0.31);
    expect(arcsIn(spy, palette[0])[0].lineWidth).toBeGreaterThan(0);
  });

  it('measures against `max` and clamps to an empty or a full ring', () => {
    const r = radial({ max: 200 });
    r.setData([
      { label: 'half', value: 100 },
      { label: 'over', value: 300 },
      { label: 'under', value: -5 },
    ]);
    const spy = renderOnce(r);

    expect(arcIn(spy, palette[0])[4]).toBeCloseTo(START + TURN * 0.5);
    expect(arcIn(spy, palette[1])[4]).toBeCloseTo(START + TURN);
    expect(arcsIn(spy, palette[2])).toHaveLength(0);
  });

  it('takes ring colors from `colors` before the theme palette', () => {
    const r = radial({ colors: ['#aa0000', '#00aa00'] });
    r.setData(RINGS.slice(0, 2));
    const spy = renderOnce(r);

    expect(arcsIn(spy, '#aa0000')).toHaveLength(1);
    expect(arcsIn(spy, '#00aa00')).toHaveLength(1);
  });

  it('lays out inside the chart padding', () => {
    const r = radial();
    r.setData(RINGS);

    const [, freeY, freeRadius] = arcsIn(renderOnce(r), TRACK)[0].args as number[];
    const [, cy, radius] = arcsIn(renderOnce(r, { padding: { top: 100, bottom: 0 } }), TRACK)[0].args as number[];

    expect(radius).toBeLessThan(freeRadius);
    expect(cy).toBeGreaterThan(freeY);
    expect(cy - radius).toBeGreaterThanOrEqual(100);
  });

  it('reports each ring as a slice with its share of `max`', () => {
    const r = radial({ max: 80 });
    r.setData([...RINGS, { label: 'Swap', value: null }]);

    expect(r.getSliceInfo(theme)).toEqual([
      { label: 'CPU', value: 72, percent: 90, color: palette[0] },
      { label: 'Memory', value: 54, percent: 67.5, color: palette[1] },
      { label: 'Disk', value: 31, percent: 38.75, color: '#00aaaa' },
      { label: 'Swap', value: 0, percent: 0, color: palette[3] },
    ]);
  });

  it('has no slices and draws nothing without data', () => {
    const r = radial();

    expect(r.getSliceInfo(theme)).toBeNull();
    expect(renderOnce(r).countOf('arc')).toBe(0);
  });
});

/** Canvas radians of a bearing in degrees clockwise from 12 o'clock. */
const bearing = (degrees: number) => ((degrees - 90) * Math.PI) / 180;

function textsOf(spy: Spy): string[] {
  return spy.callsOf('fillText').map((call) => String(call.args[0]));
}

/** Font size in px of a `fillText` call. */
function fontPx(call: RecordedCall): number {
  return Number.parseFloat(call.font.split(' ')[1]);
}

/** Length and color of every stroked line segment (a tick), in drawing order. */
function ticksOf(spy: Spy): { length: number; color: string }[] {
  const ticks: { length: number; color: string }[] = [];
  let from: number[] | null = null;

  for (const call of spy.calls) {
    if (call.method === 'moveTo') from = call.args as number[];
    if (call.method !== 'lineTo' || from === null) continue;

    const [x, y] = call.args as number[];
    ticks.push({ length: Math.hypot(x - from[0], y - from[1]), color: call.strokeStyle });
    from = null;
  }

  return ticks;
}

describe('RadialProgressRenderer — shape and parts', () => {
  it('draws each ring from `startAngle` to `endAngle` and fills it in proportion', () => {
    const r = radial({ startAngle: -90, endAngle: 90 });
    r.setData(RINGS);
    const spy = renderOnce(r);

    for (const [, , , start, end] of arcsIn(spy, TRACK).map((call) => call.args as number[])) {
      expect(start).toBeCloseTo(bearing(-90));
      expect(end).toBeCloseTo(bearing(90));
    }
    expect(arcIn(spy, palette[0])[4]).toBeCloseTo(bearing(-90) + Math.PI * 0.72);
  });

  it('grows a half arc to fill a wide box', () => {
    const size = { mediaWidth: 400, mediaHeight: 200 };
    const full = radial();
    full.setData(RINGS);
    const half = radial({ startAngle: -90, endAngle: 90 });
    half.setData(RINGS);

    const fullRadius = arcsIn(renderOnce(full, size), TRACK)[0].args[2] as number;
    const halfRadius = arcsIn(renderOnce(half, size), TRACK)[0].args[2] as number;
    expect(halfRadius).toBeGreaterThan(fullRadius * 1.4);
  });

  it('fits the round ends of the rings inside the box', () => {
    const r = radial({ startAngle: -120, endAngle: 120 });
    r.setData(RINGS);
    const outer = arcsIn(renderOnce(r, { mediaWidth: 800, mediaHeight: 200 }), TRACK)[0];
    const [, cy, radius] = outer.args as number[];

    // The box keeps a 4 px edge margin; the arc ends sit 30° under the horizontal.
    expect(cy - radius - outer.lineWidth / 2).toBeCloseTo(4);
    expect(cy + radius * Math.sin(Math.PI / 6) + outer.lineWidth / 2).toBeCloseTo(196);
  });

  it('places the rings by `layout`', () => {
    const r = radial({
      layout: ({ count }) => Array.from({ length: count }, (_, i) => ({ radius: 100 - i * 30, width: 10 - i * 2 })),
    });
    r.setData(RINGS);
    const tracks = arcsIn(renderOnce(r), TRACK);

    expect(tracks.map((call) => call.args[2])).toEqual([100, 70, 40]);
    expect(tracks.map((call) => call.lineWidth)).toEqual([10, 8, 6]);
  });

  it('draws the first item thick and the others thin with `heroLayout()`', () => {
    const r = radial({ layout: heroLayout() });
    r.setData(RINGS);
    const widths = arcsIn(renderOnce(r), TRACK).map((call) => call.lineWidth);

    expect(widths[0]).toBeGreaterThan(widths[1] * 3);
    expect(widths[1]).toBe(widths[2]);
  });

  it('paints each ring with `painter`, the track before the value', () => {
    const calls: Pick<RingPaintArgs, 'element' | 'index' | 'fraction'>[] = [];
    const r = radial({
      painter: (_env, ring) => {
        calls.push({ element: ring.element, index: ring.index, fraction: ring.fraction });

        return false;
      },
    });
    r.setData(RINGS.slice(0, 2));
    renderOnce(r);

    expect(calls).toEqual([
      { element: 'track', index: 0, fraction: 0.72 },
      { element: 'value', index: 0, fraction: 0.72 },
      { element: 'track', index: 1, fraction: 0.54 },
      { element: 'value', index: 1, fraction: 0.54 },
    ]);
  });

  it('keeps a ring memo when the options bring a new painter', () => {
    const seen: unknown[] = [];
    const counting = () => (_env: unknown, ring: RingPaintArgs) => {
      if (ring.element === 'value') {
        ring.memo.frames = Number(ring.memo.frames ?? 0) + 1;
        seen.push(ring.memo.frames);
      }

      return false;
    };
    const r = radial({ painter: counting() });
    r.setData([{ label: 'CPU', value: 50 }]);
    renderOnce(r);
    r.updateOptions({ painter: counting() });
    renderOnce(r);

    expect(seen).toEqual([1, 2]);
  });

  it('draws `tickRing()` as one tick per step, the filled ones in the ring color and the head longer', () => {
    const r = radial({ painter: tickRing({ count: 20 }) });
    r.setData([{ label: 'CPU', value: 50 }]);
    const ticks = ticksOf(renderOnce(r));

    expect(ticks.filter((tick) => tick.color === TRACK)).toHaveLength(20);
    const filled = ticks.filter((tick) => tick.color === palette[0]);
    expect(filled).toHaveLength(10);
    expect(filled[9].length).toBeGreaterThan(filled[0].length);
  });

  it('draws a ring too thin for ticks solid with `tickRing()`', () => {
    const r = radial({ layout: heroLayout(), painter: tickRing({ count: 20 }) });
    r.setData(RINGS);
    const spy = renderOnce(r);

    expect(ticksOf(spy).filter((tick) => tick.color === TRACK)).toHaveLength(20);
    expect(arcsIn(spy, TRACK)).toHaveLength(2);
  });

  it('spreads the ticks of `tickRing()` over the arc only', () => {
    const r = radial({ startAngle: -90, endAngle: 90, painter: tickRing({ count: 20 }) });
    r.setData([{ label: 'CPU', value: 100 }]);
    const ticks = ticksOf(renderOnce(r));

    expect(ticks.filter((tick) => tick.color === TRACK)).toHaveLength(10);
    expect(ticks.filter((tick) => tick.color === palette[0])).toHaveLength(10);
  });

  it('drops the ticks of `tickRing()` a value leaves at once when motion is reduced', () => {
    const r = radial({ painter: tickRing({ count: 20 }) });
    r.setData([{ label: 'CPU', value: 60 }]);
    renderOnce(r);

    r.setData([{ label: 'CPU', value: 50 }]);
    expect(ticksOf(renderOnce(r)).filter((tick) => tick.color === palette[0])).toHaveLength(10);
  });

  it('hands every ring and the free hole to `labels` once a frame', () => {
    const frames: RadialLabelArgs[] = [];
    const r = radial({
      labels: (_env, args) => {
        frames.push(args);
      },
    });
    r.setData(RINGS);
    renderOnce(r);

    expect(frames).toHaveLength(1);
    const [frame] = frames;
    const innermost = frame.rings[frame.rings.length - 1];
    expect(frame.rings.map((ring) => ring.item.label)).toEqual(['CPU', 'Memory', 'Disk']);
    expect(frame.hole).toBeCloseTo(innermost.radius - innermost.width / 2);
  });

  it('shows the first item large with the others in a line under it with `heroCenter()`', () => {
    const r = radial({ layout: heroLayout(), labels: heroCenter() });
    r.setData(RINGS);

    expect(textsOf(renderOnce(r))).toEqual(['72%', 'CPU', 'Memory 54%', 'Disk 31%']);
  });

  it('lists every item in the middle with `listCenter()`', () => {
    const r = radial({ labels: listCenter({ format: (item) => `${item.value}` }) });
    r.setData(RINGS);

    expect(textsOf(renderOnce(r))).toEqual(['CPU', '72', 'Memory', '54', 'Disk', '31']);
  });

  it('sizes the `listCenter()` rows to the hole, up to body-text size', () => {
    const r = radial({ labels: listCenter() });
    r.setData(RINGS);

    const small = fontPx(renderOnce(r, { mediaWidth: 240, mediaHeight: 240 }).callsOf('fillText')[0]);
    const large = fontPx(renderOnce(r, { mediaWidth: 800, mediaHeight: 800 }).callsOf('fillText')[0]);
    expect(small).toBeGreaterThan(8);
    expect(small).toBeLessThan(16);
    expect(large).toBe(16);
  });

  it('keeps the `heroCenter()` text inside the box on a half arc', () => {
    const r = radial({ startAngle: -90, endAngle: 90, layout: heroLayout(), labels: heroCenter() });
    r.setData(RINGS);
    const texts = renderOnce(r, { mediaWidth: 800, mediaHeight: 200 }).callsOf('fillText');

    expect(texts).toHaveLength(4);
    for (const call of texts) {
      expect((call.args[2] as number) + fontPx(call) / 2).toBeLessThanOrEqual(196);
    }
  });

  it('leaves out a `heroCenter()` caption that overflows the hole even at the readable minimum', () => {
    const label = 'Share of the cluster capacity in use right now';
    const r = radial({ layout: heroLayout(), labels: heroCenter({ rest: false }) });
    r.setData([{ label, value: 72 }]);

    expect(textsOf(renderOnce(r, { mediaWidth: 200, mediaHeight: 200 }))).toEqual(['72%']);
  });

  it('centers the label and value columns of `listCenter()` as one block', () => {
    const r = radial({ labels: listCenter({ format: (item) => `${item.value}` }) });
    r.setData(RINGS);
    const spy = renderOnce(r);
    const [cx] = arcIn(spy, palette[0]);
    const [label, value] = spy.callsOf('fillText').map((call) => call.args[1] as number);

    // The test context measures 6 px a character: `Memory` is 36 px wide, `72` is 12 px.
    expect((label + value) / 2).toBeCloseTo(cx + (36 - 12) / 2);
  });

  it('labels each ring at its start with `startLabels()`', () => {
    const r = radial({ endAngle: 270, labels: startLabels() });
    r.setData(RINGS);
    const spy = renderOnce(r);
    const [cx] = arcIn(spy, palette[0]);

    expect(textsOf(spy)).toEqual(['CPU', '72%', 'Memory', '54%', 'Disk', '31%']);
    // The ring starts at 12 o'clock and runs right, so its label sits left of the start.
    for (const call of spy.callsOf('fillText')) {
      expect(call.args[1] as number).toBeLessThan(cx);
    }
  });

  it('tags the head of each ring with `headTags()`', () => {
    const r = radial({ labels: headTags() });
    r.setData(RINGS);

    expect(textsOf(renderOnce(r))).toEqual(['CPU 72%', 'Memory 54%', 'Disk 31%']);
  });

  it('pushes a `headTags()` pill at the edge back inside the drawing area', () => {
    const r = radial({ labels: headTags() });
    r.setData([{ label: 'CPU', value: 25 }]);
    const [tag] = renderOnce(r, { mediaWidth: 200, mediaHeight: 200 }).callsOf('fillText');

    // The head is at 3 o'clock on the outer ring; `CPU 25%` is a 54 px pill in the test context.
    expect((tag.args[1] as number) + 27).toBeLessThanOrEqual(200);
  });

  describe('with more rings than the text fits', () => {
    const MANY: PieSliceInput[] = Array.from({ length: 20 }, (_, i) => ({ label: `R${i + 1}`, value: 50 }));

    it('keeps a hole for the center text in `heroLayout()`', () => {
      const frames: RadialLabelArgs[] = [];
      const r = radial({
        layout: heroLayout(),
        labels: (_env, args) => {
          frames.push(args);
        },
      });
      r.setData(MANY);
      renderOnce(r);

      const [hero] = frames[0].rings;
      expect(frames[0].hole).toBeGreaterThanOrEqual(0.55 * (hero.radius + hero.width / 2) - 1e-6);
    });

    it('ends the `heroCenter()` line with a count of the items left out', () => {
      const r = radial({ layout: heroLayout(), labels: heroCenter() });
      r.setData(MANY);
      // The value, its caption, the items that fit, then the count.
      const [, , ...line] = textsOf(renderOnce(r));
      const more = line[line.length - 1];

      expect(more).toMatch(/^\+\d+$/);
      expect(line.length - 1 + Number(more.slice(1))).toBe(MANY.length - 1);
    });

    it('ends the `listCenter()` rows with a count of the rows left out', () => {
      const r = radial({ labels: listCenter() });
      r.setData(MANY);
      const texts = textsOf(renderOnce(r));
      const more = texts[texts.length - 1];

      expect(more).toMatch(/^\+\d+ more$/);
      expect((texts.length - 1) / 2 + Number.parseInt(more.slice(1), 10)).toBe(MANY.length);
    });

    it('draws no `startLabels()` when the rings are too close for readable text', () => {
      const r = radial({ endAngle: 270, labels: startLabels() });
      r.setData(MANY);

      expect(textsOf(renderOnce(r))).toEqual([]);
    });

    it('leaves out the `headTags()` pills that would cover an earlier one', () => {
      const r = radial({ labels: headTags() });
      r.setData(MANY);
      const tags = textsOf(renderOnce(r));

      expect(tags[0]).toBe('R1 50%');
      expect(tags.length).toBeLessThan(MANY.length);
    });
  });
});

describe('tick animations', () => {
  const arriving = (age: number) => ({ age, isHead: false, leaving: false });
  const leaving = (age: number) => ({ age, isHead: false, leaving: true });

  it('pops a tick from nothing to its length', () => {
    const pop = popTicks();

    expect(pop(arriving(0))).toMatchObject({ alpha: 0 });
    expect(pop(arriving(0)).scale).toBeLessThan(0.1);
    expect(pop(arriving(320))).toMatchObject({ scale: 1, alpha: 1, flash: 0 });
  });

  it('pops a leaving tick back to nothing, without the flash', () => {
    const pop = popTicks();

    expect(pop(leaving(0))).toMatchObject({ scale: 1, alpha: 1, flash: 0 });
    expect(pop(leaving(160)).flash).toBe(0);
    expect(pop(leaving(320))).toMatchObject({ alpha: 0 });
  });

  it('heats a fresh tick and cools it down with `radarTicks()`', () => {
    const radar = radarTicks();
    const fresh = radar({ age: 0, isHead: true, leaving: false });
    const cold = radar(arriving(2000));

    expect(fresh.glow).toBeGreaterThan(10);
    expect(fresh.scale).toBeGreaterThan(1.4);
    expect(cold.glow).toBeLessThan(0.01);
    expect(cold.scale).toBeCloseTo(1);
  });

  it('dims a leaving tick out in its glow with `radarTicks()`', () => {
    const radar = radarTicks();

    expect(radar(leaving(0)).alpha).toBe(1);
    expect(radar(leaving(0)).glow).toBeGreaterThan(0);
    expect(radar(leaving(800)).alpha).toBeLessThan(0.05);
  });

  it('flies a tick out from the center with `flyTicks()`', () => {
    const fly = flyTicks();

    expect(fly(arriving(0))).toMatchObject({ alpha: 0 });
    expect(fly(arriving(0)).offset).toBeLessThan(-0.5);
    expect(fly(arriving(420))).toMatchObject({ alpha: 1 });
    expect(fly(arriving(420)).offset).toBeCloseTo(0);
  });

  it('flies a leaving tick back to the center with `flyTicks()`', () => {
    const fly = flyTicks();

    expect(fly(leaving(0))).toMatchObject({ alpha: 1 });
    expect(fly(leaving(0)).offset).toBeCloseTo(0);
    expect(fly(leaving(420))).toMatchObject({ alpha: 0 });
    expect(fly(leaving(420)).offset).toBeLessThan(-0.5);
  });
});

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

describe('RadialProgressRenderer — animation', () => {
  let now = 0;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    allowMotion();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.matchMedia = reducedMotionStub;
  });

  it('sweeps each ring up from 0 on the first data while the tracks fade in', () => {
    const r = radial({ entryMs: 1000, updateMs: 400 });
    r.setData(RINGS);

    const first = renderOnce(r);
    expect(arcsIn(first, palette[0])).toHaveLength(0);
    expect(arcsIn(first, TRACK).every((call) => call.globalAlpha === 0)).toBe(true);

    now += 500;
    const middle = arcIn(renderOnce(r), palette[0])[4];
    expect(middle).toBeGreaterThan(START);
    expect(middle).toBeLessThan(START + TURN * 0.72);

    now += 600;
    expect(arcIn(renderOnce(r), palette[0])[4]).toBeCloseTo(START + TURN * 0.72);
    expect(r.needsAnimation).toBe(false);
  });

  it('keeps the entrance running when `updateMs: 0` arrives after the first data', () => {
    // The series is made with its options, gets data in a layout effect, then replays the options.
    const r = radial({ entryMs: 1000, updateMs: 0 });
    r.setData(RINGS);
    r.updateOptions({ updateMs: 0 });
    renderOnce(r);

    now += 500;
    const end = arcIn(renderOnce(r), palette[0])[4];
    expect(end).toBeGreaterThan(START);
    expect(end).toBeLessThan(START + TURN * 0.72);
    expect(r.needsAnimation).toBe(true);
  });

  it('draws a new value at once when `updateMs: 0` arrives right after it', () => {
    const r = radial({ entryMs: 0, updateMs: 500 });
    r.setData([{ label: 'CPU', value: 20 }]);
    renderOnce(r);

    r.setData([{ label: 'CPU', value: 80 }]);
    r.updateOptions({ updateMs: 0 });

    expect(arcIn(renderOnce(r), palette[0])[4]).toBeCloseTo(START + TURN * 0.8);
    expect(r.needsAnimation).toBe(false);
  });

  it('pops each tick of `tickRing()` in as the value reaches it, and animates until they settle', () => {
    const r = radial({ entryMs: 0, updateMs: 400, painter: tickRing({ count: 20 }) });
    r.setData([{ label: 'CPU', value: 50 }]);

    const first = ticksOf(renderOnce(r));
    // A fresh tick flashes, so it is told from the track by color alone.
    const fresh = first.filter((tick) => tick.color !== TRACK);
    const track = first.find((tick) => tick.color === TRACK);
    expect(fresh).toHaveLength(10);
    expect(Math.max(...fresh.map((tick) => tick.length))).toBeLessThan(track?.length ?? 0);
    expect(r.needsAnimation).toBe(true);

    now += 1000;
    const settled = ticksOf(renderOnce(r)).filter((tick) => tick.color !== TRACK);
    expect(settled[0].length).toBeGreaterThan(track?.length ?? 0);
    expect(r.needsAnimation).toBe(false);

    // Only the ticks a new value reaches pop again.
    r.setData([{ label: 'CPU', value: 60 }]);
    renderOnce(r);
    now += 400;
    const grown = ticksOf(renderOnce(r)).filter((tick) => tick.color !== TRACK);
    expect(grown).toHaveLength(12);
    expect(grown[0].length).toBeCloseTo(settled[0].length);
    expect(grown[11].length).toBeLessThan(settled[0].length);
  });

  it('plays out the ticks a value drops below, then stops drawing them', () => {
    const r = radial({ entryMs: 0, updateMs: 400, painter: tickRing({ count: 20 }) });
    r.setData([{ label: 'CPU', value: 60 }]);
    renderOnce(r);
    now += 1000;
    renderOnce(r);

    r.setData([{ label: 'CPU', value: 50 }]);
    renderOnce(r);
    now += 400;
    // Ten filled ticks and the two the value left, still in the ring color.
    expect(ticksOf(renderOnce(r)).filter((tick) => tick.color === palette[0])).toHaveLength(12);
    expect(r.needsAnimation).toBe(true);

    now += 1000;
    expect(ticksOf(renderOnce(r)).filter((tick) => tick.color === palette[0])).toHaveLength(10);
    expect(r.needsAnimation).toBe(false);
  });

  it('draws `tickRing()` settled when the series has no motion, as with `animations={false}`', () => {
    const r = radial({ entryMs: 0, updateMs: 0, painter: tickRing({ count: 20 }) });
    r.setData([{ label: 'CPU', value: 60 }]);
    const ticks = ticksOf(renderOnce(r)).filter((tick) => tick.color === palette[0]);
    expect(ticks).toHaveLength(12);
    expect(r.needsAnimation).toBe(false);

    r.setData([{ label: 'CPU', value: 50 }]);
    expect(ticksOf(renderOnce(r)).filter((tick) => tick.color === palette[0])).toHaveLength(10);
    expect(r.needsAnimation).toBe(false);
  });

  it('glides a ring from the value on screen when a new value arrives mid-glide', () => {
    const r = radial({ entryMs: 0, updateMs: 400 });
    r.setData([{ label: 'CPU', value: 20 }]);
    renderOnce(r);

    r.setData([{ label: 'CPU', value: 80 }]);
    renderOnce(r);
    now += 200;
    const halfway = arcIn(renderOnce(r), palette[0])[4];

    r.setData([{ label: 'CPU', value: 40 }]);
    expect(arcIn(renderOnce(r), palette[0])[4]).toBeCloseTo(halfway);

    now += 400;
    expect(arcIn(renderOnce(r), palette[0])[4]).toBeCloseTo(START + TURN * 0.4);
    expect(r.needsAnimation).toBe(false);
  });
});
