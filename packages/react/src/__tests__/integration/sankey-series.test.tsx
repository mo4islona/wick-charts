import {
  type SankeyLink,
  type SankeyNode,
  SankeySeries,
  SankeyTooltip,
  type SeriesHoverInfo,
} from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const NODES: SankeyNode[] = [{ id: 'ads', label: 'Ads' }, { id: 'signup', label: 'Signup' }, { id: 'trial' }];
const TO_SIGNUP: SankeyLink[] = [{ source: 'ads', target: 'signup', value: 10 }];
const TO_TRIAL: SankeyLink[] = [{ source: 'ads', target: 'trial', value: 10 }];

function floatingTooltip(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('div')) {
    if (el.style.position === 'absolute' && el.style.zIndex === '10') return el;
  }

  return null;
}

describe('<SankeySeries>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  function hoverAt(clientX: number, clientY: number): void {
    if (mounted === null) throw new Error('not mounted');

    mounted.dispatchMouse('mousemove', { clientX, clientY }, mounted.overlayCanvas);
    mounted.flushScheduler();
  }

  it('draws the bands and the node labels on a chart with no axes', () => {
    mounted = mountChart(<SankeySeries nodes={NODES} links={TO_SIGNUP} />);
    mounted.flushScheduler();

    expect(mounted.chart.yAxisWidth).toBe(0);
    expect(mounted.mainSpy.countOf('bezierCurveTo')).toBe(2);
    const texts = mounted.mainSpy.callsOf('fillText').map((call) => call.args[0]);
    expect(texts).toEqual(expect.arrayContaining(['Ads · 10', 'Signup · 10']));
  });

  it('shows the hovered node and link in the tooltip', () => {
    mounted = mountChart(
      <>
        <SankeySeries nodes={NODES} links={TO_SIGNUP} />
        <SankeyTooltip />
      </>,
    );
    mounted.flushScheduler();

    hoverAt(6, 200);
    expect(floatingTooltip(mounted.container)?.textContent).toBe('Ads10100.0%');

    hoverAt(400, 200);
    expect(floatingTooltip(mounted.container)?.textContent).toBe('Ads → Signup10100.0%');
  });

  it('updates the tooltip under a resting pointer when the data changes', () => {
    const tree = (links: SankeyLink[]) => (
      <>
        <SankeySeries nodes={NODES} links={links} />
        <SankeyTooltip format={(value) => `${value} visits`} />
      </>
    );
    mounted = mountChart(tree(TO_SIGNUP));
    mounted.flushScheduler();

    hoverAt(400, 200);
    expect(floatingTooltip(mounted.container)?.textContent).toBe('Ads → Signup10 visits100.0%');

    // The link under the pointer is gone; a new one takes its place there.
    mounted.rerender(tree(TO_TRIAL));
    mounted.flushScheduler();
    expect(floatingTooltip(mounted.container)?.textContent).toBe('Ads → trial10 visits100.0%');

    mounted.rerender(tree([{ ...TO_TRIAL[0], value: 25 }]));
    mounted.flushScheduler();
    expect(floatingTooltip(mounted.container)?.textContent).toBe('Ads → trial25 visits100.0%');
  });

  it('sends seriesHover again under a resting pointer when the hovered data changes or goes', () => {
    const tree = (links: SankeyLink[]) => <SankeySeries nodes={NODES} links={links} />;
    mounted = mountChart(tree(TO_SIGNUP));
    mounted.flushScheduler();

    const events: (SeriesHoverInfo | null)[] = [];
    mounted.chart.on('seriesHover', (hit) => {
      events.push(hit);
    });

    hoverAt(400, 200);
    expect(events.map((hit) => hit?.info?.value)).toEqual([10]);

    mounted.rerender(tree([{ ...TO_SIGNUP[0], value: 25 }]));
    mounted.flushScheduler();
    expect(events.at(-1)?.info).toMatchObject({ label: 'Ads → Signup', value: 25 });

    mounted.rerender(tree([]));
    mounted.flushScheduler();
    expect(events.at(-1)).toBeNull();
    expect(events).toHaveLength(3);
  });

  it('passes the labels option through to the series', () => {
    mounted = mountChart(<SankeySeries nodes={NODES} links={TO_SIGNUP} options={{ labels: false }} />);
    mounted.flushScheduler();

    expect(mounted.mainSpy.countOf('fillText')).toBe(0);
  });
});
