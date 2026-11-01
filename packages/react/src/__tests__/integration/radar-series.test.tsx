import { Legend, type RadarLayer, RadarSeries, RadarTooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const AXES = ['Speed', 'Power', 'Range', 'Comfort'];
const SERIES: RadarLayer[] = [
  { label: 'Big', data: [90, 80, 85, 70] },
  { label: 'Small', data: [30, 25, null, 35] },
];
const GRID = '#123456';

type Mounted = ReturnType<typeof mountChart>;

function floatingTooltip(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('div')) {
    if (el.style.position === 'absolute' && el.style.zIndex === '10') return el;
  }

  return null;
}

/** The point every grid spoke starts from. */
function webCenter(mounted: Mounted): { x: number; y: number } {
  const counts = new Map<string, number>();
  for (const call of mounted.mainSpy.callsOf('moveTo')) {
    if (call.strokeStyle !== GRID) continue;

    const key = (call.args as number[]).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [x, y] = top[0].split(',').map(Number);

  return { x, y };
}

describe('<RadarSeries>', () => {
  let mounted: Mounted | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('draws the web, the axis names and one polygon per series on a chart with no axes', () => {
    mounted = mountChart(
      <RadarSeries axes={AXES} data={SERIES} options={{ gridColor: GRID, colors: ['#aa0000', '#00aa00'] }} />,
    );
    mounted.flushScheduler();

    expect(mounted.chart.yAxisWidth).toBe(0);
    const texts = mounted.mainSpy.callsOf('fillText').map((call) => call.args[0]);
    expect(texts).toEqual(expect.arrayContaining([...AXES, '25', '50', '75', '100']));

    const strokes = mounted.mainSpy.callsOf('stroke');
    expect(strokes.some((call) => call.strokeStyle === '#aa0000')).toBe(true);
    expect(strokes.some((call) => call.strokeStyle === '#00aa00')).toBe(true);
    expect(strokes.some((call) => call.strokeStyle === GRID)).toBe(true);
  });

  it('names the legend rows by the data labels and hides a polygon on a click', () => {
    mounted = mountChart(
      <>
        <RadarSeries id="radar" axes={AXES} data={SERIES} options={{ colors: ['#aa0000', '#00aa00'] }} />
        <Legend />
      </>,
    );
    mounted.flushScheduler();

    const legend = mounted.container.querySelector<HTMLElement>('[data-legend]');
    expect(legend?.textContent).toBe('BigSmall');

    const small = legend?.children[1] as HTMLElement;
    mounted.mainSpy.reset();
    small.click();
    mounted.flushScheduler();

    expect(mounted.chart.isLayerVisible('radar', 1)).toBe(false);

    const strokes = mounted.mainSpy.callsOf('stroke');
    expect(strokes.some((call) => call.strokeStyle === '#aa0000')).toBe(true);
    expect(strokes.some((call) => call.strokeStyle === '#00aa00')).toBe(false);
  });

  it('lists every axis value of the hovered polygon in the tooltip', () => {
    mounted = mountChart(
      <>
        <RadarSeries axes={AXES} data={SERIES} options={{ gridColor: GRID }} />
        <RadarTooltip format={(value) => `${value}pt`} />
      </>,
    );
    mounted.flushScheduler();

    const center = webCenter(mounted);
    mounted.dispatchMouse('mousemove', { clientX: center.x, clientY: center.y }, mounted.overlayCanvas);
    mounted.flushScheduler();

    expect(floatingTooltip(mounted.container)?.textContent).toBe('SmallSpeed30ptPower25ptRange—Comfort35pt');
  });

  it('keeps the tooltip on the hovered polygon when the layers reorder', () => {
    const tree = (data: RadarLayer[]) => (
      <>
        <RadarSeries axes={AXES} data={data} options={{ gridColor: GRID }} />
        <RadarTooltip />
      </>
    );
    mounted = mountChart(tree(SERIES));
    mounted.flushScheduler();

    const center = webCenter(mounted);
    mounted.dispatchMouse('mousemove', { clientX: center.x, clientY: center.y }, mounted.overlayCanvas);
    mounted.flushScheduler();
    expect(floatingTooltip(mounted.container)?.textContent).toContain('Small');

    mounted.rerender(tree([SERIES[1], SERIES[0]]));
    mounted.flushScheduler();

    expect(floatingTooltip(mounted.container)?.textContent).toContain('Small');
  });

  it('morphs to new values passed as props', () => {
    const tree = (data: RadarLayer[]) => <RadarSeries id="radar" axes={AXES} data={data} options={{ updateMs: 0 }} />;
    mounted = mountChart(tree(SERIES));
    mounted.flushScheduler();

    mounted.rerender(tree([{ label: 'Big', data: [10, 20, 30, 40] }]));
    mounted.flushScheduler();

    expect(mounted.chart.getLayerLabel('radar', 0)).toBe('Big');
    expect(mounted.chart.getSeriesLayers('radar')).toBeNull();
    expect(mounted.chart.getSeriesLabel('radar')).toBe('Big');
  });
});
