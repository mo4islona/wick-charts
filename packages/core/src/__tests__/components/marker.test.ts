// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../../chart';
import { type MarkerShape, type ResolvedMarker, renderMarker } from '../../components/marker';
import { catppuccin } from '../../theme/themes/catppuccin';
import { buildRenderContext } from '../helpers/render-context';

const RED = '#ff0000';

// timeRange [0,100] over 800px and yRange [0,100] over 400px (pr=1) put a marker
// at time=50/value=50 onto bitmap (400, 200), with a glyph radius of 4.
function renderAt(marker: Partial<ResolvedMarker> & { shape: MarkerShape }, phase = 0) {
  const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
  const resolved: ResolvedMarker = {
    time: 50,
    value: 50,
    color: RED,
    pulse: false,
    ...marker,
  };
  renderMarker({
    scope: built.ctx.scope,
    timeScale: built.timeScale,
    yScale: built.yScale,
    theme: built.ctx.theme,
    marker: resolved,
    phase,
  });

  return built.spy;
}

describe('renderMarker', () => {
  it('dot: one arc at the anchor, filled with the marker color', () => {
    const spy = renderAt({ shape: 'dot' });

    expect(spy.countOf('arc')).toBe(1);

    const arc = spy.callsOf('arc')[0];
    expect(arc.args.slice(0, 3)).toEqual([400, 200, 4]);

    const fill = spy.callsOf('fill').at(-1);
    expect(fill?.fillStyle).toBe(RED);
  });

  it('pulse: adds a translucent halo arc around the dot', () => {
    // phase 0.25 → |sin(π/2)| = 1 → max halo (glow radius 8).
    const spy = renderAt({ shape: 'dot', pulse: true }, 0.25);

    expect(spy.countOf('arc')).toBe(2);

    const radii = spy.callsOf('arc').map((c) => c.args[2]);
    expect(radii).toEqual([8, 4]);

    const haloFill = spy.callsOf('fill')[0];
    expect(haloFill.fillStyle.startsWith('rgba')).toBe(true);
  });

  it('circle: strokes a ring in the marker color, never fills the glyph', () => {
    const spy = renderAt({ shape: 'circle' });

    expect(spy.countOf('arc')).toBe(1);
    expect(spy.countOf('fill')).toBe(0);

    const stroke = spy.callsOf('stroke')[0];
    expect(stroke.strokeStyle).toBe(RED);
  });

  it('arrow-down: a triangle whose tip sits on the anchor, body above it', () => {
    const spy = renderAt({ shape: 'arrow-down' });

    expect(spy.matchesSequence(['beginPath', 'moveTo', 'lineTo', 'lineTo', 'closePath', 'fill'])).toBe(true);

    const tip = spy.callsOf('moveTo')[0];
    expect(tip.args).toEqual([400, 200]);

    // Body extends upward (smaller Y) for a downward-pointing arrow.
    const baseYs = spy.callsOf('lineTo').map((c) => c.args[1]);
    expect(baseYs).toEqual([191, 191]);
  });

  it('arrow-up: tip on the anchor, body below it', () => {
    const spy = renderAt({ shape: 'arrow-up' });

    const tip = spy.callsOf('moveTo')[0];
    expect(tip.args).toEqual([400, 200]);

    const baseYs = spy.callsOf('lineTo').map((c) => c.args[1]);
    expect(baseYs).toEqual([209, 209]);
  });

  it('label: draws the text in the theme label color, offset from the glyph', () => {
    const spy = renderAt({ shape: 'dot', label: 'broke' });

    const text = spy.callsOf('fillText');
    expect(text).toHaveLength(1);
    expect(text[0].args[0]).toBe('broke');
    // textX = bx(400) + glyphHalfWidth(4) + gap(6) + padX(6) = 416; y = anchor.
    expect(text[0].args.slice(1)).toEqual([416, 200]);
    expect(text[0].fillStyle).toBe(catppuccin.theme.yLabel.textColor);
  });

  it('does not draw when the anchor is non-finite', () => {
    const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
    renderMarker({
      scope: built.ctx.scope,
      timeScale: built.timeScale,
      yScale: built.yScale,
      theme: built.ctx.theme,
      marker: { time: 50, value: Number.NaN, color: RED, shape: 'dot', pulse: false },
      phase: 0,
    });

    expect(built.spy.countOf('arc')).toBe(0);
  });
});

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const width = 800;
  const height = 400;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance markers', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('addMarker registers a normalized entry and returns its id', () => {
    const id = chart.addMarker({ time: 5, value: 42 });

    const markers = chart.getMarkers();
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ id, time: 5, value: 42, shape: 'dot', pulse: false });
  });

  it('updateMarker replaces the entry in place', () => {
    const id = chart.addMarker({ time: 5, value: 42, label: 'open' });
    chart.updateMarker(id, { time: 9, value: 7, shape: 'arrow-up', pulse: true, label: 'closed' });

    expect(chart.getMarkers()[0]).toMatchObject({
      id,
      time: 9,
      value: 7,
      shape: 'arrow-up',
      pulse: true,
      label: 'closed',
    });
  });

  it('removeMarker drops the entry; unknown ids are a no-op', () => {
    const id = chart.addMarker({ time: 5, value: 42 });
    chart.removeMarker('nope');
    expect(chart.getMarkers()).toHaveLength(1);

    chart.removeMarker(id);
    expect(chart.getMarkers()).toHaveLength(0);
  });

  it('keeps markers out of the series model', () => {
    chart.addSeries('line');
    chart.addMarker({ time: 1, value: 1 });

    expect(chart.getSeriesIds()).toHaveLength(1);
    expect(chart.getMarkers()).toHaveLength(1);
  });

  it('normalizes Date anchors to epoch ms', () => {
    const when = new Date(1_700_000_000_000);
    chart.addMarker({ time: when, value: 1 });

    expect(chart.getMarkers()[0].time).toBe(1_700_000_000_000);
  });
});
