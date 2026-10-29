import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GaugeRenderer } from '../../series/gauge';
import type { RecordedCall } from '../../testing/recording-context';
import { catppuccin } from '../../theme/themes/catppuccin';
import type { ChartTheme } from '../../theme/types';
import type { GaugeSeriesOptions } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const theme = catppuccin.theme;
const TRACK = '#111111';
const VALUE = '#222222';
/** No sweep, no glide, fixed colors. */
const STILL: Partial<GaugeSeriesOptions> = { entryMs: 0, updateMs: 0, trackColor: TRACK, color: VALUE };

/** Canvas radians of a bearing in degrees clockwise from 12 o'clock. */
const bearing = (degrees: number) => ((degrees - 90) * Math.PI) / 180;

function gauge(options: Partial<GaugeSeriesOptions> = {}): GaugeRenderer {
  return new GaugeRenderer({ options: { ...STILL, ...options }, theme });
}

function renderOnce(r: GaugeRenderer, opts: Parameters<typeof buildRenderContext>[0] = {}) {
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

function textsOf(spy: Spy): string[] {
  return spy.callsOf('fillText').map((call) => String(call.args[0]));
}

function textCall(spy: Spy, text: string): RecordedCall {
  const call = spy.callsOf('fillText').find((candidate) => candidate.args[0] === text);
  if (call === undefined) throw new Error(`no text ${text}`);

  return call;
}

function fontSize(call: RecordedCall): number {
  const match = call.font.match(/([\d.]+)px/);
  if (match === null) throw new Error(`no size in ${call.font}`);

  return Number(match[1]);
}

describe('GaugeRenderer — arc', () => {
  it('draws the track over the full sweep and the value arc from min to the value', () => {
    const r = gauge();
    r.setData(50);
    const spy = renderOnce(r);

    const [, , trackRadius, trackStart, trackEnd] = arcIn(spy, TRACK);
    expect(trackStart).toBeCloseTo(bearing(-120));
    expect(trackEnd).toBeCloseTo(bearing(120));

    const [, , valueRadius, valueStart, valueEnd] = arcIn(spy, VALUE);
    expect(valueRadius).toBe(trackRadius);
    expect(valueStart).toBeCloseTo(bearing(-120));
    expect(valueEnd).toBeCloseTo(bearing(0));
  });

  it('maps the value through min / max and the start / end angles', () => {
    const r = gauge({ min: -50, max: 150, startAngle: -90, endAngle: 90 });
    r.setData(100);
    const spy = renderOnce(r);

    const [, , , start, end] = arcIn(spy, VALUE);
    expect(start).toBeCloseTo(bearing(-90));
    expect(end).toBeCloseTo(bearing(45));
  });

  it('draws no value arc at min and a full one at max', () => {
    const atMin = gauge();
    atMin.setData(0);
    expect(arcsIn(renderOnce(atMin), VALUE)).toHaveLength(0);

    const atMax = gauge();
    atMax.setData(100);
    const [, , , , end] = arcIn(renderOnce(atMax), VALUE);
    expect(end).toBeCloseTo(bearing(120));
  });

  it('clamps a value outside the range on the arc but shows the real value', () => {
    const above = gauge();
    above.setData(140);
    const aboveSpy = renderOnce(above);
    expect(arcIn(aboveSpy, VALUE)[4]).toBeCloseTo(bearing(120));
    expect(textsOf(aboveSpy)).toContain('140');

    const below = gauge();
    below.setData(-20);
    const belowSpy = renderOnce(below);
    expect(arcsIn(belowSpy, VALUE)).toHaveLength(0);
    expect(textsOf(belowSpy)).toContain('-20');
  });

  it('draws nothing without a value and ignores a value that is not a finite number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = gauge();
    expect(renderOnce(r).countOf('arc')).toBe(0);

    r.setData(Number.NaN);
    expect(renderOnce(r).countOf('arc')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('lays out inside the chart padding', () => {
    const r = gauge();
    r.setData(50);

    const [, freeY, freeRadius] = arcIn(renderOnce(r), TRACK);
    const [, cy, radius] = arcIn(renderOnce(r, { padding: { top: 80, bottom: 40 } }), TRACK);

    expect(radius).toBeLessThan(freeRadius);
    expect(cy).not.toBeCloseTo(freeY);
    // The outer edge of the track stays below the top padding.
    expect(cy - radius).toBeGreaterThanOrEqual(80);
  });
});

describe('GaugeRenderer — zones', () => {
  const zones = [
    { to: 60, color: '#00aa00' },
    { to: 85, color: '#aaaa00' },
    { to: 100, color: '#aa0000' },
  ];

  it('draws each zone along the arc and colors the value arc by the zone it ends in', () => {
    const r = gauge({ zones });
    r.setData(72);
    const spy = renderOnce(r);
    const [, , trackRadius] = arcIn(spy, TRACK);

    // The zones run in a thin band outside the track.
    const [, , greenRadius, greenStart, greenEnd] = arcIn(spy, '#00aa00');
    expect(greenRadius).toBeGreaterThan(trackRadius);
    expect(greenStart).toBeCloseTo(bearing(-120));
    expect(greenEnd).toBeCloseTo(bearing(-120 + 240 * 0.6));

    const amber = arcsIn(spy, '#aaaa00').map((call) => call.args as number[]);
    const amberZone = amber.find((args) => args[2] === greenRadius);
    const valueArc = amber.find((args) => args[2] === trackRadius);
    expect(amberZone?.[3]).toBeCloseTo(greenEnd);
    expect(amberZone?.[4]).toBeCloseTo(bearing(-120 + 240 * 0.85));
    expect(valueArc?.[3]).toBeCloseTo(bearing(-120));
    expect(valueArc?.[4]).toBeCloseTo(bearing(-120 + 240 * 0.72));
    expect(arcsIn(spy, VALUE)).toHaveLength(0);
  });

  it('uses `color` past the last zone', () => {
    const r = gauge({ zones: [{ to: 50, color: '#00aa00' }] });
    r.setData(70);

    expect(arcIn(renderOnce(r), VALUE)[4]).toBeCloseTo(bearing(-120 + 240 * 0.7));
  });

  it('samples the theme zone ramp good → bad for zones without a color', () => {
    const r = gauge({ zones: [{ to: 30 }, { to: 70 }, { to: 100 }], color: undefined });
    r.setData(10);
    const spy = renderOnce(r);
    const ramp = theme.gauge?.zoneColors ?? [];

    expect(arcsIn(spy, ramp[0]).length).toBeGreaterThanOrEqual(2);
    expect(arcsIn(spy, ramp[ramp.length - 1])).toHaveLength(1);
  });

  it('derives the track and zone colors for a theme literal without a gauge block', () => {
    const { gauge: _gauge, ...literal } = theme;
    const bare: ChartTheme = literal;
    const r = new GaugeRenderer({
      options: { entryMs: 0, updateMs: 0, zones: [{ to: 50 }, { to: 100 }] },
      theme: bare,
    });
    r.setData(80);
    const spy = renderOnce(r, { theme: bare });

    const strokes = spy.callsOf('arc').map((call) => call.strokeStyle);
    expect(strokes).toContain(theme.gauge?.trackColor);
    expect(strokes).toContain(theme.gauge?.zoneColors[2]);
  });
});

describe('GaugeRenderer — needle', () => {
  it('points a needle at the value instead of filling the arc', () => {
    const r = gauge({ style: 'needle' });
    r.setData(100);
    const spy = renderOnce(r);

    // The only arc in the value color is the hub, a full circle.
    expect(arcsIn(spy, VALUE).map((call) => call.args[3])).toEqual([0]);
    const [cx, cy] = arcIn(spy, TRACK);
    const [move] = spy.callsOf('moveTo');
    const [tip] = spy.callsOf('lineTo');
    expect(move.args).toEqual([cx, cy]);

    const [tipX, tipY] = tip.args as number[];
    expect(Math.atan2(tipY - cy, tipX - cx)).toBeCloseTo(bearing(120));
  });

  it('puts the label under the hub', () => {
    const r = gauge({ style: 'needle', label: 'CPU' });
    r.setData(42);
    const spy = renderOnce(r);

    const [cx, cy] = arcIn(spy, TRACK);
    const hub = spy.callsOf('arc').find((call) => call.fillStyle === VALUE && call.args[3] === 0);
    if (hub === undefined) throw new Error('no hub');

    const value = textCall(spy, '42');
    const valueTop = (value.args[2] as number) - fontSize(value) / 2;
    expect(value.args[1]).toBe(cx);
    expect(valueTop).toBeGreaterThan(cy + (hub.args[2] as number));
    expect(textCall(spy, 'CPU').args[2]).toBeGreaterThan(value.args[2] as number);
  });

  it('shrinks a long value so it fits between the needle ends', () => {
    const short = gauge({ style: 'needle' });
    short.setData(5);
    const long = gauge({ style: 'needle', format: (value) => `${value} requests per second` });
    long.setData(5);

    const shortSize = fontSize(textCall(renderOnce(short), '5'));
    const longSpy = renderOnce(long);
    const longText = textCall(longSpy, '5 requests per second');
    const [cx, cy] = arcIn(longSpy, TRACK);

    expect(fontSize(longText)).toBeLessThan(shortSize);
    // The stub measures 6 px per character at the nominal size; the fitted font scales it down.
    const nominalWidth = '5 requests per second'.length * 6;
    const width = nominalWidth * (fontSize(longText) / shortSize);
    const top = (longText.args[2] as number) - cy - fontSize(longText) / 2;
    expect(width / 2).toBeLessThan(top * Math.tan(Math.PI / 3));
    expect(longText.args[1]).toBe(cx);
  });

  it('puts the label over the hub when the needle sweeps the bottom', () => {
    const r = gauge({ style: 'needle', startAngle: 90, endAngle: 270, label: 'CPU' });
    r.setData(50);
    const spy = renderOnce(r);

    const [, cy] = arcIn(spy, TRACK);
    const value = textCall(spy, '50');
    const caption = textCall(spy, 'CPU');
    expect(caption.args[2] as number).toBeLessThan(cy);
    expect(value.args[2] as number).toBeLessThan(caption.args[2] as number);
  });

  it('puts the label under the dial when the needle can point both up and down', () => {
    const r = gauge({ style: 'needle', startAngle: 0, endAngle: 360, label: 'CPU' });
    r.setData(50);
    const spy = renderOnce(r);

    const [, cy, trackRadius] = arcIn(spy, TRACK);
    const track = arcsIn(spy, TRACK)[0];
    const dialBottom = cy + trackRadius + track.lineWidth / 2;
    const value = textCall(spy, '50');
    expect((value.args[2] as number) - fontSize(value) / 2).toBeGreaterThan(dialBottom);
    expect(textCall(spy, 'CPU').args[2]).toBeGreaterThan(value.args[2] as number);
  });

  it('leaves out a caption that overflows its row even at the readable minimum', () => {
    const r = gauge({ label: 'requests per second across every region' });
    r.setData(42);

    expect(textsOf(renderOnce(r, { mediaWidth: 120, mediaHeight: 120 }))).not.toContain(
      'requests per second across every region',
    );
    expect(textsOf(renderOnce(r, { mediaWidth: 120, mediaHeight: 120 }))).toContain('42');
  });
});

describe('GaugeRenderer — labels', () => {
  it('fits a range label wider than half the canvas into its half', () => {
    const r = gauge({ format: (v) => `${v} requests per second, rolling` });
    r.setData(50);
    const spy = renderOnce(r, { mediaWidth: 120, mediaHeight: 120 });

    for (const text of ['0 requests per second, rolling', '100 requests per second, rolling']) {
      const call = textCall(spy, text);
      const x = call.args[1] as number;
      const maxWidth = call.args[3] as number;
      expect(maxWidth).toBeLessThan(text.length * 6);
      expect(x - maxWidth / 2).toBeGreaterThanOrEqual(0);
      expect(x + maxWidth / 2).toBeLessThanOrEqual(120);
    }
  });

  it('puts the default range labels below their arc ends', () => {
    const r = gauge();
    r.setData(50);
    const spy = renderOnce(r);
    const [cx, cy, trackRadius] = arcIn(spy, TRACK);
    const endY = cy + trackRadius * Math.sin(bearing(120));

    for (const text of ['0', '100']) {
      const label = textCall(spy, text);
      const top = (label.args[2] as number) - fontSize(label) / 2;
      expect(top).toBeGreaterThan(endY);
    }
    // Pushed along the arc toward the gap: just inside its end, not out past it.
    expect(textCall(spy, '0').args[1]).toBeGreaterThan(cx + trackRadius * Math.cos(bearing(-120)));
    expect(textCall(spy, '100').args[1]).toBeLessThan(cx + trackRadius * Math.cos(bearing(120)));
  });

  it('keeps the range labels of a turned arc off the track', () => {
    const r = gauge({ startAngle: 0, endAngle: 270 });
    r.setData(50);
    const spy = renderOnce(r);
    const [cx, cy, trackRadius, start, end] = arcIn(spy, TRACK);
    const halfTrack = arcsIn(spy, TRACK)[0].lineWidth / 2;

    for (const text of ['0', '100']) {
      const label = textCall(spy, text);
      const x = label.args[1] as number;
      const y = label.args[2] as number;
      const halfWidth = (text.length * 6) / 2;
      const halfHeight = fontSize(label) / 2;

      for (const px of [x - halfWidth, x, x + halfWidth]) {
        for (const py of [y - halfHeight, y, y + halfHeight]) {
          const radius = Math.hypot(px - cx, py - cy);
          const onRing = Math.abs(radius - trackRadius) <= halfTrack;
          let angle = Math.atan2(py - cy, px - cx);
          if (angle < start) angle += Math.PI * 2;
          const alongArc = angle <= end;
          expect(onRing && alongArc).toBe(false);

          // Nor on a round cap past either end.
          for (const cap of [start, end]) {
            const capX = cx + trackRadius * Math.cos(cap);
            const capY = cy + trackRadius * Math.sin(cap);
            expect(Math.hypot(px - capX, py - capY)).toBeGreaterThan(halfTrack);
          }
        }
      }
    }
  });

  it('draws no range labels on a full circle, where min and max meet', () => {
    const r = gauge({ startAngle: 0, endAngle: 360 });
    r.setData(50);

    expect(textsOf(renderOnce(r))).toEqual(['50']);
  });

  it('keeps wide range labels inside the canvas on a semicircle', () => {
    const r = gauge({
      startAngle: -90,
      endAngle: 90,
      min: -1_000_000,
      max: 1_000_000,
      format: (v) => v.toLocaleString('en-US'),
    });
    r.setData(0);
    const spy = renderOnce(r, { mediaWidth: 400, mediaHeight: 400 });

    for (const text of ['-1,000,000', '1,000,000']) {
      const call = textCall(spy, text);
      // The stub measures 6 px per character, and the label is centered on its x.
      const half = (text.length * 6) / 2;
      const x = call.args[1] as number;
      expect(x - half).toBeGreaterThanOrEqual(0);
      expect(x + half).toBeLessThanOrEqual(400);
    }
  });

  it('keeps the room of the center label inside the canvas on a narrow arc', () => {
    const r = gauge({ startAngle: -120, endAngle: -60, label: 'p95' });
    r.setData(50);
    const spy = renderOnce(r, { mediaWidth: 400, mediaHeight: 400 });
    const [cx, , trackRadius] = arcIn(spy, TRACK);
    const trackInner = trackRadius - arcsIn(spy, TRACK)[0].lineWidth / 2;
    // The paint fits the value text into 80 % of the track's inner diameter.
    const half = 0.8 * trackInner;

    expect(cx - half).toBeGreaterThanOrEqual(0);
    expect(cx + half).toBeLessThanOrEqual(400);
  });

  it('shows the value, the caption and the range ends', () => {
    const r = gauge({ label: 'CPU load' });
    r.setData(72);
    const spy = renderOnce(r);

    expect(textsOf(spy)).toEqual(['72', 'CPU load', '0', '100']);
    expect(textCall(spy, 'CPU load').fillStyle).toBe(theme.axis.textColor);
    expect(fontSize(textCall(spy, '72'))).toBeGreaterThan(fontSize(textCall(spy, 'CPU load')));
  });

  it('formats the value and the range ends with `format`', () => {
    const r = gauge({ format: (value) => `${value}%` });
    r.setData(72.5);

    expect(textsOf(renderOnce(r))).toEqual(['72.5%', '0%', '100%']);
  });

  it('formats with four significant digits by default, compact from a thousand', () => {
    const r = gauge();
    r.setData(1234.5);
    expect(textsOf(renderOnce(r))[0]).toBe('1.235K');

    r.setData(23.9);
    expect(textsOf(renderOnce(r))[0]).toBe('23.9');
  });

  it('hides the range ends with `rangeLabels: false`', () => {
    const r = gauge({ rangeLabels: false });
    r.setData(72);

    expect(textsOf(renderOnce(r))).toEqual(['72']);
  });

  it('scales the label with the gauge', () => {
    const r = gauge();
    r.setData(72);

    const big = fontSize(textCall(renderOnce(r, { mediaWidth: 800, mediaHeight: 400 }), '72'));
    const small = fontSize(textCall(renderOnce(r, { mediaWidth: 400, mediaHeight: 200 }), '72'));
    // Half the canvas, half the font, but for the fixed edge margin.
    expect(small / big).toBeCloseTo(0.5, 1);
  });

  it('reports the zone color of the value as its layer color', () => {
    const r = gauge({
      zones: [
        { to: 50, color: '#00aa00' },
        { to: 100, color: '#aa0000' },
      ],
    });
    r.setData(80);

    expect(r.getLayerColors()).toEqual(['#aa0000']);
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

describe('GaugeRenderer — animation', () => {
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

  const animated = (options: Partial<GaugeSeriesOptions> = {}) => gauge({ entryMs: 1000, updateMs: 400, ...options });

  it('sweeps the first value up from min while the track and the end labels fade in', () => {
    const r = animated({ min: 20 });
    r.setData(80);
    expect(r.needsAnimation).toBe(true);

    const first = renderOnce(r);
    expect(arcsIn(first, VALUE)).toHaveLength(0);
    expect(textsOf(first)[0]).toBe('20');
    expect(arcIn(first, TRACK)).toBeDefined();
    expect(arcsIn(first, TRACK)[0].globalAlpha).toBe(0);
    expect(textCall(first, '100').globalAlpha).toBe(0);

    now += 500;
    const middle = renderOnce(r);
    const [, , , , end] = arcIn(middle, VALUE);
    expect(end).toBeGreaterThan(bearing(-120));
    expect(end).toBeLessThan(bearing(-120 + 240 * 0.75));
    expect(arcsIn(middle, TRACK)[0].globalAlpha).toBe(1);

    // The count-up shows whole numbers on the way to a whole target.
    const counted = Number(textsOf(middle)[0]);
    expect(Number.isInteger(counted)).toBe(true);
    expect(counted).toBeGreaterThan(20);
    expect(counted).toBeLessThan(80);

    now += 600;
    const last = renderOnce(r);
    expect(arcIn(last, VALUE)[4]).toBeCloseTo(bearing(-120 + 240 * 0.75));
    expect(textsOf(last)[0]).toBe('80');
    expect(r.needsAnimation).toBe(false);
  });

  it('glides a new value from the one on screen, and a value mid-glide never jumps', () => {
    const r = animated({ entryMs: 0 });
    r.setData(20);
    renderOnce(r);

    r.setData(80);
    renderOnce(r);
    now += 200;
    const halfway = arcIn(renderOnce(r), VALUE)[4];
    expect(halfway).toBeGreaterThan(bearing(-120 + 240 * 0.2));
    expect(halfway).toBeLessThan(bearing(-120 + 240 * 0.8));

    r.setData(10);
    const retargeted = arcIn(renderOnce(r), VALUE)[4];
    expect(retargeted).toBeCloseTo(halfway);

    now += 100;
    expect(arcIn(renderOnce(r), VALUE)[4]).toBeLessThan(halfway);

    now += 400;
    expect(arcIn(renderOnce(r), VALUE)[4]).toBeCloseTo(bearing(-120 + 240 * 0.1));
    expect(r.needsAnimation).toBe(false);
  });

  describe('value color across zones', () => {
    const LOW = '#00aa00';
    const HIGH = '#aa0000';
    const zoned = (options: Partial<GaugeSeriesOptions> = {}) =>
      animated({
        zones: [
          { to: 50, color: LOW },
          { to: 100, color: HIGH },
        ],
        color: undefined,
        ...options,
      });

    /** Stroke color of the value arc: as wide as the track, unlike the thin zone band. */
    function valueColorOf(spy: Spy): string {
      const width = arcsIn(spy, TRACK)[0].lineWidth;
      const arcs = spy.callsOf('arc').filter((call) => call.lineWidth === width && call.strokeStyle !== TRACK);
      if (arcs.length !== 1) throw new Error(`expected one value arc, got ${arcs.length}`);

      return String(arcs[0].strokeStyle);
    }

    it('keeps the color of the target zone through the entrance', () => {
      const r = zoned();
      r.setData(90);
      renderOnce(r);

      // The sweep is still in the low zone here.
      now += 300;
      expect(valueColorOf(renderOnce(r))).toBe(HIGH);

      now += 800;
      expect(valueColorOf(renderOnce(r))).toBe(HIGH);
    });

    it('blends the color from the old zone to the new one over a glide', () => {
      const r = zoned({ entryMs: 0 });
      r.setData(20);
      expect(valueColorOf(renderOnce(r))).toBe(LOW);

      r.setData(90);
      renderOnce(r);
      now += 200;
      const midway = valueColorOf(renderOnce(r));
      expect(midway).not.toBe(LOW);
      expect(midway).not.toBe(HIGH);

      now += 300;
      expect(valueColorOf(renderOnce(r))).toBe(HIGH);
    });

    it("morphs the color through the zones as the arc sweeps up with `zoneColor: 'morph'`", () => {
      const r = zoned({ zoneColor: 'morph' });
      r.setData(90);
      renderOnce(r);

      now += 300;
      expect(valueColorOf(renderOnce(r))).toBe(LOW);

      // Halfway the arc is at 45, inside the blend band around the border at 50.
      now += 200;
      const border = valueColorOf(renderOnce(r));
      expect(border).not.toBe(LOW);
      expect(border).not.toBe(HIGH);

      now += 600;
      expect(valueColorOf(renderOnce(r))).toBe(HIGH);
    });

    it("keeps the pure zone color away from a border with `zoneColor: 'morph'`", () => {
      const r = zoned({ zoneColor: 'morph', entryMs: 0, updateMs: 0 });
      r.setData(20);
      expect(valueColorOf(renderOnce(r))).toBe(LOW);
      expect(r.getLayerColors()).toEqual([LOW]);

      r.setData(80);
      expect(valueColorOf(renderOnce(r))).toBe(HIGH);
    });
  });

  it('keeps a running glide when the same value arrives again', () => {
    const r = animated({ entryMs: 0 });
    r.setData(20);
    renderOnce(r);
    r.setData(80);
    renderOnce(r);
    now += 200;
    const halfway = arcIn(renderOnce(r), VALUE)[4];

    r.setData(80);
    expect(arcIn(renderOnce(r), VALUE)[4]).toBeCloseTo(halfway);
  });

  it('keeps the entrance running when `updateMs: 0` arrives after the first value', () => {
    // The series is made with its options, gets data in a layout effect, then replays the options.
    const r = animated({ updateMs: 0 });
    r.setData(80);
    r.updateOptions({ updateMs: 0 });
    renderOnce(r);

    now += 500;
    const end = arcIn(renderOnce(r), VALUE)[4];
    expect(end).toBeGreaterThan(bearing(-120));
    expect(end).toBeLessThan(bearing(-120 + 240 * 0.8));
    expect(r.needsAnimation).toBe(true);
  });

  it('draws a new value at once when `updateMs: 0` arrives right after it', () => {
    const r = animated({ entryMs: 0, updateMs: 500 });
    r.setData(20);
    renderOnce(r);

    r.setData(80);
    r.updateOptions({ updateMs: 0 });

    expect(arcIn(renderOnce(r), VALUE)[4]).toBeCloseTo(bearing(-120 + 240 * 0.8));
    expect(r.needsAnimation).toBe(false);
  });

  it('snaps with `entryMs: 0` and `updateMs: 0`', () => {
    const r = gauge();
    r.setData(30);
    expect(r.needsAnimation).toBe(false);
    r.setData(60);
    expect(r.needsAnimation).toBe(false);
    expect(arcIn(renderOnce(r), VALUE)[4]).toBeCloseTo(bearing(-120 + 240 * 0.6));
  });
});
