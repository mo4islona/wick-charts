// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../../chart';
import { type ResolvedTimeRegion, renderTimeRegion } from '../../components/time-region';
import { catppuccin } from '../../theme/themes/catppuccin';
import { buildRenderContext } from '../helpers/render-context';

const RED = '#ff0000';
const FILL = 'rgba(255, 0, 0, 0.1)';

// timeRange [0,100] over 800px (pr=1) makes timeToBitmapX(t) = t * 8; the plot
// is 800×400 bitmap pixels.
function renderRegion(region: Partial<ResolvedTimeRegion> = {}) {
  const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
  const resolved: ResolvedTimeRegion = {
    from: 20,
    to: 60,
    fill: FILL,
    color: RED,
    ...region,
  };
  renderTimeRegion({
    scope: built.ctx.scope,
    timeScale: built.timeScale,
    theme: built.ctx.theme,
    region: resolved,
    plotWidth: 800,
    plotHeight: 400,
  });

  return built.spy;
}

describe('renderTimeRegion', () => {
  it('fills the band spanning [from, to] over the full plot height', () => {
    const spy = renderRegion({ from: 20, to: 60 });

    const fills = spy.callsOf('fillRect');
    expect(fills).toHaveLength(1);
    // from=20 → x 160, to=60 → x 480 → width 320; full height 400.
    expect(fills[0].args).toEqual([160, 0, 320, 400]);
    expect(fills[0].fillStyle).toBe(FILL);
  });

  it('open-ended (to=null) fills to the right edge of the plot', () => {
    const spy = renderRegion({ from: 50, to: null });

    const fill = spy.callsOf('fillRect')[0];
    // from=50 → x 400; open-ended extends to plotWidth 800 → width 400.
    expect(fill.args).toEqual([400, 0, 400, 400]);
  });

  it('clamps the fill to the plot when an edge runs off-screen', () => {
    const spy = renderRegion({ from: -20, to: 60 });

    const fill = spy.callsOf('fillRect')[0];
    // from=-20 → x -160 clamps to 0; to=60 → x 480.
    expect(fill.args).toEqual([0, 0, 480, 400]);
  });

  it('delineates a closed band with two faint edge lines', () => {
    const spy = renderRegion({ from: 20, to: 60 });

    const strokes = spy.callsOf('stroke');
    expect(strokes).toHaveLength(2);
    expect(strokes[0].strokeStyle).toBe(RED);
    expect(strokes[0].globalAlpha).toBeCloseTo(0.5, 5);
  });

  it('draws only the left edge for an open-ended band', () => {
    const spy = renderRegion({ from: 50, to: null });

    expect(spy.countOf('stroke')).toBe(1);
  });

  it('draws the label in a pill, text in the theme label color', () => {
    const spy = renderRegion({ from: 20, to: 60, label: 'anomaly window' });

    const text = spy.callsOf('fillText');
    expect(text).toHaveLength(1);
    expect(text[0].args[0]).toBe('anomaly window');
    expect(text[0].fillStyle).toBe(catppuccin.theme.yLabel.textColor);

    // The pill (a rounded-rect fill) precedes the text.
    expect(spy.matchesSequence(['fill', 'fillText'])).toBe(true);
  });

  it('draws nothing when the band is entirely off-screen', () => {
    const spy = renderRegion({ from: -50, to: -10 });

    expect(spy.countOf('fillRect')).toBe(0);
    expect(spy.countOf('stroke')).toBe(0);
  });

  it('draws nothing when an edge is non-finite', () => {
    const spy = renderRegion({ from: Number.NaN, to: 60 });

    expect(spy.countOf('fillRect')).toBe(0);
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

describe('ChartInstance regions', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('addRegion registers a normalized entry and returns its id', () => {
    const id = chart.addRegion({ from: 10, to: 40, fill: FILL, label: 'window' });

    const regions = chart.getRegions();
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ id, from: 10, to: 40, fill: FILL, label: 'window' });
  });

  it('treats an omitted or "now" end as open-ended (to: null)', () => {
    const a = chart.addRegion({ from: 10 });
    const b = chart.addRegion({ from: 20, to: 'now' });

    const [ra, rb] = chart.getRegions();
    expect(ra).toMatchObject({ id: a, from: 10, to: null });
    expect(rb).toMatchObject({ id: b, from: 20, to: null });
  });

  it('updateRegion replaces the entry in place', () => {
    const id = chart.addRegion({ from: 10, to: 40 });
    chart.updateRegion(id, { from: 5, to: 'now', label: 'firing' });

    expect(chart.getRegions()[0]).toMatchObject({ id, from: 5, to: null, label: 'firing' });
  });

  it('removeRegion drops the entry; unknown ids are a no-op', () => {
    const id = chart.addRegion({ from: 10, to: 40 });
    chart.removeRegion('nope');
    expect(chart.getRegions()).toHaveLength(1);

    chart.removeRegion(id);
    expect(chart.getRegions()).toHaveLength(0);
  });

  it('keeps regions out of the series model', () => {
    chart.addSeries('line');
    chart.addRegion({ from: 1, to: 2 });

    expect(chart.getSeriesIds()).toHaveLength(1);
    expect(chart.getRegions()).toHaveLength(1);
  });

  it('normalizes Date edges to epoch ms', () => {
    const from = new Date(1_700_000_000_000);
    const to = new Date(1_700_000_600_000);
    chart.addRegion({ from, to });

    expect(chart.getRegions()[0]).toMatchObject({ from: 1_700_000_000_000, to: 1_700_000_600_000 });
  });
});
