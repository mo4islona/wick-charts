import { act } from '@testing-library/react';
import { PieSeries, PieTooltip } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Fire the ResizeObserver callback for the *tooltip container* directly
 * (rather than the global `triggerResize`, which fans out with the chart
 * host size). Picks the container by its `data-measured="false"` marker —
 * the pre-measurement frame — so we can feed it a custom content size and
 * test how `computeTooltipPosition` reacts to the measured dimensions.
 */
function fireTooltipResize(node: HTMLElement, width: number, height: number) {
  type Ctor = {
    callbacks: Set<(entries: ResizeObserverEntry[], observer: ResizeObserver) => void>;
  };
  const ctor = (globalThis as unknown as { __mockResizeObserver: Ctor }).__mockResizeObserver;
  const observer: ResizeObserver = { observe() {}, unobserve() {}, disconnect() {} };
  const entry = {
    target: node,
    contentRect: { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) },
    borderBoxSize: [{ inlineSize: width, blockSize: height }],
    contentBoxSize: [{ inlineSize: width, blockSize: height }],
    devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }],
  } as unknown as ResizeObserverEntry;
  act(() => {
    for (const cb of Array.from(ctor.callbacks)) cb([entry], observer);
  });
}

/**
 * PieTooltip renders only when both `useCrosshairPosition(chart)` AND
 * `chart.getHoverInfo(seriesId)` resolve non-null.
 *
 * To drive the positive path deterministically we dispatch a mousemove on
 * the overlay canvas at a point inside the large slice's wedge. With slices
 * { Alpha: 40%, Beta: 60% } the pie starts at 12 o'clock going clockwise,
 * so Alpha occupies angles 0°–144° (top → right-bottom) and Beta the
 * remaining 216°. A move below-center lands squarely inside Beta.
 */
describe('PieTooltip', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const slices = [
    { label: 'Alpha', value: 40 },
    { label: 'Beta', value: 60 },
  ];

  const id = 'pie';

  function PieWithTooltip() {
    return (
      <>
        <PieSeries id={id} data={slices} />
        <PieTooltip seriesId={id} />
      </>
    );
  }

  it('renders nothing before any hover', () => {
    mounted = mountChart(<PieWithTooltip />);
    expect(mounted.container.textContent).not.toContain('Alpha');
    expect(mounted.container.textContent).not.toContain('Beta');
  });

  it('shows the hovered slice label when mouse is over that slice', () => {
    mounted = mountChart(<PieWithTooltip />, { width: 400, height: 400 });
    // Center X, 50 px below center Y — inside Beta's wedge (180° from top).
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    expect(mounted.container.textContent).toContain('Beta');
  });

  it('omitted seriesId picks the first visible pie series', () => {
    mounted = mountChart(
      <>
        <PieSeries id={id} data={slices} />
        <PieTooltip />
      </>,
      { width: 400, height: 400 },
    );
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    expect(mounted.container.textContent).toContain('Beta');
  });

  it('children render-prop replaces default UI and receives hover info', () => {
    let captured: { label: string; value: number } | null = null;
    mounted = mountChart(
      <>
        <PieSeries id={id} data={slices} />
        <PieTooltip seriesId={id}>
          {({ info, format }) => {
            captured = { label: info.label, value: info.value };

            return <div data-testid="custom-pie-tooltip">{format(info.value)}</div>;
          }}
        </PieTooltip>
      </>,
      { width: 400, height: 400 },
    );
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    const custom = mounted.container.querySelector('[data-testid="custom-pie-tooltip"]');
    expect(custom).not.toBeNull();
    expect(captured).not.toBeNull();
    expect(captured!.label).toBe('Beta');
  });

  it('custom slot: pre-measurement frame hides the tooltip (data-measured=false, visibility hidden)', () => {
    mounted = mountChart(
      <>
        <PieSeries id={id} data={slices} />
        <PieTooltip seriesId={id}>{({ info }) => <div data-testid="t">{info.label}</div>}</PieTooltip>
      </>,
      { width: 400, height: 400 },
    );
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const content = mounted.container.querySelector<HTMLElement>('[data-testid="t"]');
    const container = content?.parentElement as HTMLElement;
    expect(container).toBeDefined();
    // Regression: before the fix, PieTooltip used a hardcoded 160×70 for the
    // position and rendered immediately — near the right edge the custom DOM
    // would overflow. Now we wait for measurement and hide until the first
    // ResizeObserver callback.
    expect(container.dataset.measured).toBe('false');
    expect(container.style.visibility).toBe('hidden');
  });

  it('custom slot: repositions based on the measured container size (near right edge it flips left)', () => {
    mounted = mountChart(
      <>
        <PieSeries id={id} data={slices} />
        <PieTooltip seriesId={id}>{({ info }) => <div data-testid="t">{info.label}</div>}</PieTooltip>
      </>,
      { width: 400, height: 400 },
    );
    // Hover inside Beta (below-center) — a 300-wide measured tooltip can't
    // fit to the right of the cursor in a 400-wide chart, so
    // `computeTooltipPosition` must flip and clamp it into bounds.
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const content = mounted.container.querySelector<HTMLElement>('[data-testid="t"]');
    const container = content?.parentElement as HTMLElement;
    expect(container).toBeDefined();
    expect(container.dataset.measured).toBe('false');

    // Feed the ResizeObserver a realistic "wide custom content" size. Position
    // must clamp to stay in bounds — i.e. `left + width <= chartWidth`.
    fireTooltipResize(container, 300, 120);
    mounted.flushScheduler();

    expect(container.dataset.measured).toBe('true');
    expect(container.style.visibility).toBe('visible');
    const left = Number.parseFloat(container.style.left);
    expect(Number.isFinite(left)).toBe(true);
    // The whole tooltip fits inside the chart — without this fix the
    // hardcoded 160×70 flip would leave left=360+16=376 (overflow).
    expect(left + 300).toBeLessThanOrEqual(400);
  });

  it('clears the tooltip when the cursor leaves the canvas', () => {
    mounted = mountChart(<PieWithTooltip />, { width: 400, height: 400 });

    // Force a known hover state first (as in the test above).
    mounted.dispatchMouse('mousemove', { clientX: 200, clientY: 250 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    // Pre-condition: tooltip is visible. Without this, the mouseleave
    // assertion below could pass trivially by never rendering.
    expect(mounted.container.textContent).toContain('Beta');

    mounted.dispatchMouse('mouseleave', {}, mounted.overlayCanvas);
    mounted.flushScheduler();

    const text = mounted.container.textContent ?? '';
    expect(text).not.toContain('Alpha');
    expect(text).not.toContain('Beta');
  });
});
