import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { Viewport } from '../viewport';

/**
 * `ChartInstance.setPadding` refits the viewport only when horizontal padding
 * (left/right) actually changes. Vertical padding only affects the Y-scale
 * layout — touching it mustn't reset the user's zoom / pan / auto-scroll.
 * This regression suite pins that contract so wrappers can safely re-apply
 * padding from a Title / TooltipLegend ResizeObserver.
 */
describe('ChartInstance.setPadding — refit discipline', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    document.body.appendChild(container);
    chart = new ChartInstance(container, { interactive: false });
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [
      { time: 1000, value: 10 },
      { time: 2000, value: 20 },
      { time: 3000, value: 30 },
    ]);
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('does not emit `viewportChange` when only vertical padding changes', () => {
    // `fitToData` is the only path in `setPadding` that mutates the visible
    // range and triggers viewport 'change' → chart 'viewportChange'. If we
    // correctly skip the refit for vertical-only updates, no event fires.
    let fired = 0;
    chart.on('viewportChange', () => {
      fired++;
    });

    chart.setPadding({ top: 80 });
    expect(fired).toBe(0);

    chart.setPadding({ bottom: 60 });
    expect(fired).toBe(0);
  });

  it('does emit `viewportChange` when horizontal padding changes', () => {
    let fired = 0;
    chart.on('viewportChange', () => {
      fired++;
    });

    chart.setPadding({ right: { intervals: 10 } });
    expect(fired).toBeGreaterThan(0);
  });

  it('no-ops on identical padding — fitToData is not re-entered', () => {
    // Establish a baseline padding.
    chart.setPadding({ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } });
    let fired = 0;
    chart.on('viewportChange', () => {
      fired++;
    });

    // Identical payload — nothing should change, no refit.
    chart.setPadding({ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } });
    expect(fired).toBe(0);
  });
});

/**
 * `Viewport.getPadding()` is what lets `ChartInstance.setPadding` compare
 * before/after to decide whether a refit is needed. Small unit coverage.
 */
describe('Viewport.getPadding', () => {
  it('reflects resolved padding including defaults', () => {
    const v = new Viewport({ padding: { top: 42 } });
    const p = v.getPadding();
    expect(p.top).toBe(42);
    // Unspecified fields fall back to the documented defaults (20/20/{intervals:3}/{intervals:0}).
    expect(p.bottom).toBe(20);
    expect(p.right).toEqual({ intervals: 3 });
    expect(p.left).toEqual({ intervals: 0 });
  });

  it('updates when setPadding is called', () => {
    const v = new Viewport();
    v.setPadding({ top: 80 });
    expect(v.getPadding().top).toBe(80);
    v.setPadding({ right: 50, left: 12 });
    expect(v.getPadding().right).toBe(50);
    expect(v.getPadding().left).toBe(12);
  });
});
