import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { type FakeRaf, installRaf } from './helpers/fake-raf';

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 0, 1);

function makeChart(options?: ChartOptions) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 800, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false, timeZone: 'UTC', ...options }), container };
}

function points(args: { count: number; value: (i: number) => number }) {
  return Array.from({ length: args.count }, (_, i) => ({ time: T0 + i * MINUTE, value: args.value(i) }));
}

function readDom(container: HTMLElement) {
  const [main, overlay] = container.querySelectorAll('canvas');

  return {
    role: main?.getAttribute('role') ?? null,
    label: main?.getAttribute('aria-label') ?? null,
    overlayHidden: overlay?.getAttribute('aria-hidden') ?? null,
    details: container.querySelector<HTMLElement>('[data-wick-description]')?.textContent ?? null,
  };
}

describe('chart accessibility text', () => {
  let raf: FakeRaf;
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(T0);
    raf = installRaf();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.useRealTimers();
  });

  it('labels the main canvas and adds the full text by default', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line', { label: 'BTC' });
    chart.setSeriesData(id, points({ count: 60, value: (i) => 100 + i }));
    raf.flush(40);
    vi.advanceTimersByTime(1000);

    const dom = readDom(container);

    expect(dom.role).toBe('img');
    // The view pads past the data, so the span starts the evening before.
    expect(dom.label).toMatch(
      /^Line chart, Dec 31, 2025, 11:59\sPM\s–\sJan 1, 2026, 1:02\sAM\. BTC: 100 to 159 in view, last 159\.$/,
    );
    expect(dom.overlayHidden).toBe('true');
    expect(dom.details).toContain(`${id} (line "BTC"): 60 points`);
    // Outside production builds the text lists the issues too.
    expect(dom.details).toContain('Issues: none.');
  });

  it('updates the text at most once a second', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line', { label: 'BTC' });
    chart.setSeriesData(id, points({ count: 10, value: () => 1 }));
    raf.flush(40);
    vi.advanceTimersByTime(0);
    expect(readDom(container).label).toContain('BTC: 1 in view');

    chart.setSeriesData(id, points({ count: 10, value: () => 2 }));
    raf.flush(40);
    vi.advanceTimersByTime(500);
    expect(readDom(container).label).toContain('BTC: 1 in view');

    vi.advanceTimersByTime(500);
    expect(readDom(container).label).toContain('BTC: 2 in view');
  });

  it('adds nothing with accessibility off, and everything once it is turned on', () => {
    ({ chart, container } = makeChart({ accessibility: false }));
    const id = chart.addSeries('line');
    chart.setSeriesData(id, points({ count: 10, value: (i) => i }));
    raf.flush(40);
    vi.advanceTimersByTime(2000);

    expect(readDom(container)).toEqual({ role: null, label: null, overlayHidden: null, details: null });

    chart.setAccessibility({ enabled: true });

    expect(readDom(container).role).toBe('img');
    expect(readDom(container).details).toContain('series');

    chart.setAccessibility({ enabled: false });

    expect(readDom(container)).toEqual({ role: null, label: null, overlayHidden: null, details: null });
  });

  it('uses the app label in place of the summary', () => {
    ({ chart, container } = makeChart({ ariaLabel: 'Bitcoin price today' }));
    vi.advanceTimersByTime(1000);
    expect(readDom(container).label).toBe('Bitcoin price today');

    chart.setAccessibility({ label: 'Bitcoin price this week' });
    expect(readDom(container).label).toBe('Bitcoin price this week');
  });

  it('removes its element on destroy', () => {
    ({ chart, container } = makeChart());
    vi.advanceTimersByTime(1000);
    expect(container.querySelector('[data-wick-description]')).not.toBeNull();

    chart.destroy();

    expect(container.querySelector('[data-wick-description]')).toBeNull();
  });

  it('names pie slices in the summary', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('pie', { label: 'Share' });
    chart.setSeriesData(id, [
      { label: 'BTC', value: 60 },
      { label: 'ETH', value: 40 },
    ]);
    raf.flush(40);
    vi.advanceTimersByTime(1000);

    expect(readDom(container).label).toBe('Pie chart. Share: BTC 60%, ETH 40%.');
  });
});
