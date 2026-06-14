// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../../chart';
import { type ResolvedReferenceLine, renderReferenceLine } from '../../components/reference-line';
import { catppuccin } from '../../theme/themes/catppuccin';
import { buildRenderContext } from '../helpers/render-context';

const RED = '#ff0000';

// timeRange [0,100] over 800px and yRange [0,100] over 400px (pr=1): a value of
// 50 maps to bitmap-Y 200, a time of 30 to bitmap-X 240. Odd stroke widths get
// a +0.5 center snap.
function renderLine(line: Partial<ResolvedReferenceLine> = {}) {
  const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
  const resolved: ResolvedReferenceLine = {
    orientation: 'horizontal',
    coord: 50,
    color: RED,
    style: 'dashed',
    width: 1,
    ...line,
  };
  renderReferenceLine({
    scope: built.ctx.scope,
    timeScale: built.timeScale,
    yScale: built.yScale,
    theme: built.ctx.theme,
    line: resolved,
    plotWidth: 800,
    plotHeight: 400,
  });

  return built.spy;
}

describe('renderReferenceLine', () => {
  it('horizontal: strokes a full-width line at the value Y, in the line color', () => {
    const spy = renderLine({ orientation: 'horizontal', coord: 50 });

    expect(spy.callsOf('moveTo')[0].args).toEqual([0, 200.5]);
    expect(spy.callsOf('lineTo')[0].args).toEqual([800, 200.5]);

    const stroke = spy.callsOf('stroke')[0];
    expect(stroke.strokeStyle).toBe(RED);
  });

  it('vertical: strokes a full-height line at the time X', () => {
    const spy = renderLine({ orientation: 'vertical', coord: 30 });

    expect(spy.callsOf('moveTo')[0].args).toEqual([240.5, 0]);
    expect(spy.callsOf('lineTo')[0].args).toEqual([240.5, 400]);
  });

  it('dashes by default; solid clears the dash pattern', () => {
    const dashed = renderLine({ style: 'dashed' });
    expect(dashed.callsOf('setLineDash')[0].args[0]).toEqual([4, 4]);

    const solid = renderLine({ style: 'solid' });
    const dashArgs = solid.callsOf('setLineDash').map((c) => c.args[0]);
    // The only dash call for a solid line is the trailing reset.
    expect(dashArgs).toEqual([[]]);
  });

  it('scales the stroke width to device pixels', () => {
    const spy = renderLine({ orientation: 'horizontal', coord: 50, width: 2 });

    const stroke = spy.callsOf('stroke')[0];
    expect(stroke.lineWidth).toBe(2);
  });

  it('draws the label in a pill, text in the theme label color', () => {
    const spy = renderLine({ orientation: 'horizontal', coord: 50, label: 'alert' });

    const text = spy.callsOf('fillText');
    expect(text).toHaveLength(1);
    expect(text[0].args[0]).toBe('alert');
    expect(text[0].fillStyle).toBe(catppuccin.theme.yLabel.textColor);
  });

  it('draws nothing when a horizontal line sits outside the Y viewport', () => {
    const spy = renderLine({ orientation: 'horizontal', coord: 150 });

    expect(spy.countOf('stroke')).toBe(0);
  });

  it('draws nothing when a vertical line sits outside the time viewport', () => {
    const spy = renderLine({ orientation: 'vertical', coord: 120 });

    expect(spy.countOf('stroke')).toBe(0);
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

describe('ChartInstance reference lines', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('addLine with a value registers a horizontal line', () => {
    const id = chart.addLine({ value: 0.5, label: 'alert' });

    const lines = chart.getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      id,
      orientation: 'horizontal',
      coord: 0.5,
      label: 'alert',
      style: 'dashed',
      width: 1,
    });
  });

  it('addLine with a time registers a vertical line at the normalized ms', () => {
    const id = chart.addLine({ time: 42 });

    expect(chart.getLines()[0]).toMatchObject({ id, orientation: 'vertical', coord: 42 });
  });

  it('lets a time win over a value when both are set', () => {
    chart.addLine({ value: 5, time: 99 });

    expect(chart.getLines()[0]).toMatchObject({ orientation: 'vertical', coord: 99 });
  });

  it('updateLine replaces the entry in place', () => {
    const id = chart.addLine({ value: 0.5 });
    chart.updateLine(id, { time: 7, style: 'solid', width: 2 });

    expect(chart.getLines()[0]).toMatchObject({ id, orientation: 'vertical', coord: 7, style: 'solid', width: 2 });
  });

  it('removeLine drops the entry; unknown ids are a no-op', () => {
    const id = chart.addLine({ value: 1 });
    chart.removeLine('nope');
    expect(chart.getLines()).toHaveLength(1);

    chart.removeLine(id);
    expect(chart.getLines()).toHaveLength(0);
  });

  it('keeps reference lines out of the series model', () => {
    chart.addSeries('line');
    chart.addLine({ value: 1 });

    expect(chart.getSeriesIds()).toHaveLength(1);
    expect(chart.getLines()).toHaveLength(1);
  });

  it('normalizes a Date anchor to epoch ms', () => {
    chart.addLine({ time: new Date(1_700_000_000_000) });

    expect(chart.getLines()[0].coord).toBe(1_700_000_000_000);
  });
});
