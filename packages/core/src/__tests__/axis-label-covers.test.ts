// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const MINUTE = 60_000;
const LABEL_WIDTH = 40;

function box(args: { left: number; width: number; top?: number; height?: number }): DOMRect {
  const { left, width, top = 0, height = 16 } = args;

  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

// happy-dom lays nothing out: a tick label spans 40 px around its `left`, a cover reports `coverBox`.
let coverBox: DOMRect = box({ left: 0, width: 0 });

describe('axis label covers', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let strip: HTMLElement;
  let unmountLabels: () => void;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.cover !== undefined) return coverBox;

      return box({ left: Number.parseFloat(this.style.left) - LABEL_WIDTH / 2, width: LABEL_WIDTH });
    });

    container = makeChartContainer(800, 400);
    chart = new ChartInstance(container, { animations: false, timeZone: 'UTC' });
    const id = chart.addSeries('line');
    const start = Date.UTC(2024, 0, 1);
    chart.setSeriesData(
      id,
      Array.from({ length: 120 }, (_, i) => ({ time: start + i * MINUTE, value: i })),
    );
    raf.flush(5);

    strip = document.createElement('div');
    container.appendChild(strip);
    unmountLabels = mountAxisLabels({ chart, container: strip, axis: 'x' });
  });

  afterEach(() => {
    unmountLabels();
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  function labels(): { text: string; left: number; shown: boolean }[] {
    return [...strip.querySelectorAll('span')].map((span) => ({
      text: span.textContent ?? '',
      left: Number.parseFloat(span.style.left),
      shown: Number(span.style.opacity) > 0,
    }));
  }

  function makeCover(): HTMLElement {
    const el = document.createElement('div');
    el.dataset.cover = '';
    container.appendChild(el);

    return el;
  }

  it('hides the tick labels a cover overlaps or nearly touches, and only while it is registered', async () => {
    const before = labels();
    expect(before.length).toBeGreaterThan(3);
    expect(before.every((label) => label.shown)).toBe(true);

    // Over the second label, and 2 px short of the third one's left edge.
    const [, second, third] = before;
    coverBox = box({ left: second.left - 10, width: third.left - LABEL_WIDTH / 2 - 2 - (second.left - 10) });
    const cover = chart.coverAxisLabels(makeCover());
    await Promise.resolve();

    expect(labels().map((label) => label.shown)).toEqual(before.map((_, i) => i !== 1 && i !== 2));

    cover.remove();
    await Promise.resolve();

    expect(labels().every((label) => label.shown)).toBe(true);
  });

  it('re-checks the labels when the cover reports a move', async () => {
    const before = labels();
    coverBox = box({ left: before[0].left - 5, width: 10 });
    const cover = chart.coverAxisLabels(makeCover());
    await Promise.resolve();

    expect(labels().map((label) => label.shown)).toEqual(before.map((_, i) => i !== 0));

    coverBox = box({ left: before[3].left - 5, width: 10 });
    cover.update();
    await Promise.resolve();

    expect(labels().map((label) => label.shown)).toEqual(before.map((_, i) => i !== 3));
  });

  it('shows the labels again once the cover turns invisible', async () => {
    const before = labels();
    coverBox = box({ left: before[0].left - 5, width: 10 });
    const el = makeCover();
    // happy-dom has no `checkVisibility`; this one reads each property only when asked, as Chrome does.
    el.checkVisibility = (options?: CheckVisibilityOptions) => {
      const hiddenByVisibility = options?.visibilityProperty === true && el.style.visibility === 'hidden';
      const hiddenByOpacity = options?.opacityProperty === true && el.style.opacity === '0';

      return !hiddenByVisibility && !hiddenByOpacity;
    };
    const cover = chart.coverAxisLabels(el);
    await Promise.resolve();

    expect(labels()[0].shown).toBe(false);

    el.style.visibility = 'hidden';
    cover.update();
    await Promise.resolve();

    expect(labels()[0].shown).toBe(true);

    el.style.visibility = '';
    el.style.opacity = '0';
    cover.update();
    await Promise.resolve();

    expect(labels()[0].shown).toBe(true);
  });

  it('hides nothing under a cover with no size or outside the document', async () => {
    const before = labels();
    coverBox = box({ left: before[0].left - 5, width: 0 });
    const empty = chart.coverAxisLabels(makeCover());
    await Promise.resolve();

    expect(labels().every((label) => label.shown)).toBe(true);

    empty.remove();
    coverBox = box({ left: before[0].left - 5, width: 10 });
    const detached = makeCover();
    detached.remove();
    chart.coverAxisLabels(detached);
    await Promise.resolve();

    expect(labels().every((label) => label.shown)).toBe(true);
  });
});
