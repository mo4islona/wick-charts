import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';

const WIDTH = 400;
const HEIGHT = 400;

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: HEIGHT,
    right: WIDTH,
    width: WIDTH,
    height: HEIGHT,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: WIDTH, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: HEIGHT, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container), container };
}

/** Interactions attach to the top (overlay) canvas. */
function clickAt(container: HTMLElement, type: 'click' | 'dblclick', offsetX: number, offsetY: number): void {
  const canvases = container.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const event = new MouseEvent(type, { bubbles: true, clientX: offsetX, clientY: offsetY });
  Object.defineProperty(event, 'offsetX', { value: offsetX });
  Object.defineProperty(event, 'offsetY', { value: offsetY });
  overlay.dispatchEvent(event);
}

describe('ChartInstance pointClick / pointDoubleClick', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('emits pointClick with the resolved position and a null spatialHit when no spatial series is hit', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 20 }, (_, i) => ({ time: i * 60_000, value: 100 + i })),
    );
    const onClick = vi.fn();
    chart.on('pointClick', onClick);

    clickAt(container, 'click', 50, 60);

    expect(onClick).toHaveBeenCalledWith({
      mediaX: 50,
      mediaY: 60,
      time: chart.timeScale.xToTime(50),
      y: chart.yScale.yToValue(60),
      spatialHit: null,
    });
  });

  it('resolves spatialHit to the pie slice under the click', () => {
    const pieId = chart.addSeries('pie');
    chart.setSeriesData(pieId, [
      { label: 'A', value: 25 },
      { label: 'B', value: 25 },
      { label: 'C', value: 50 },
    ]);
    const onClick = vi.fn();
    chart.on('pointClick', onClick);

    // Slightly above center → first slice (starts at 12 o'clock).
    clickAt(container, 'click', WIDTH / 2 + 5, HEIGHT / 2 - 50);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].spatialHit).toEqual({ seriesId: pieId, index: 0 });
  });

  it('dblclick fits content to the data and emits pointDoubleClick', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 500 }, (_, i) => ({ time: i * 60_000, value: 100 + i })),
    );
    // Zoom into a narrow slice so fitContent has visible work to do.
    chart.setVisibleRange({ from: 0, to: 60_000 * 10 });
    const before = chart.getVisibleRange();

    const onDblClick = vi.fn();
    chart.on('pointDoubleClick', onDblClick);

    clickAt(container, 'dblclick', 50, 60);

    expect(onDblClick).toHaveBeenCalledTimes(1);
    const after = chart.getVisibleRange();
    expect(after.to - after.from).toBeGreaterThan(before.to - before.from);
  });
});
