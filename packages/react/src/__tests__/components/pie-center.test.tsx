import { act } from '@testing-library/react';
import { PieCenter, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('PieCenter', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const slices = [
    { label: 'A', value: 25 },
    { label: 'B', value: 25 },
    { label: 'C', value: 50 },
  ];
  const donut = { innerRadiusRatio: 0.6, sliceLabels: { mode: 'none' as const } };

  function centerOf(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[data-chart-pie-center]');
  }

  it('shows the total and the label in the hole', () => {
    mounted = mountChart(
      <>
        <PieSeries data={slices} options={donut} />
        <PieCenter label="Total sessions" format={(v) => `${v} visits`} />
      </>,
    );
    mounted.flushScheduler();
    act(() => {});

    const center = centerOf(mounted.container);
    expect(center?.textContent).toContain('100 visits');
    expect(center?.textContent).toContain('Total sessions');
  });

  it('sits on the hole that the renderer reports', () => {
    mounted = mountChart(
      <>
        <PieSeries id="share" data={slices} options={donut} />
        <PieCenter />
      </>,
    );
    mounted.flushScheduler();
    act(() => {});

    const hole = mounted.chart.getPieHole('share');
    const center = centerOf(mounted.container);
    expect(hole).not.toBeNull();
    if (!hole || !center) return;

    const size = hole.innerRadius * Math.SQRT2;
    expect(Number.parseFloat(center.style.left)).toBeCloseTo(hole.x - size / 2, 3);
    expect(Number.parseFloat(center.style.top)).toBeCloseTo(hole.y - size / 2, 3);
    expect(Number.parseFloat(center.style.width)).toBeCloseTo(size, 3);
  });

  it('shows the hovered slice while the pointer is on it, and the total with followHover off', () => {
    const pies = (followHover: boolean) => (
      <>
        <PieSeries id="share" data={slices} options={donut} />
        <PieCenter label="Total" followHover={followHover} format={(v) => `${v}`} />
      </>
    );

    for (const followHover of [true, false]) {
      mounted = mountChart(pies(followHover), { width: 400, height: 400 });
      mounted.flushScheduler();
      act(() => {});

      // Left of the center, in the ring: 270° from 12 o'clock is the middle of C (180°–360°).
      const hole = mounted.chart.getPieHole('share');
      if (!hole) throw new Error('no hole');
      const ringX = hole.x - (hole.innerRadius + hole.outerRadius) / 2;
      mounted.dispatchMouse('mousemove', { clientX: ringX, clientY: hole.y }, mounted.overlayCanvas);
      mounted.flushScheduler();
      act(() => {});

      const text = centerOf(mounted.container)?.textContent ?? '';
      if (followHover) {
        expect(text).toContain('50');
        expect(text).toContain('C · 50.0%');
      } else {
        expect(text).toContain('100');
        expect(text).toContain('Total');
      }

      mounted.unmount();
      mounted = null;
    }
  });

  it('renders nothing for a pie without a hole', () => {
    mounted = mountChart(
      <>
        <PieSeries data={slices} options={{ sliceLabels: { mode: 'none' } }} />
        <PieCenter label="Total" />
      </>,
    );
    mounted.flushScheduler();
    act(() => {});

    expect(centerOf(mounted.container)).toBeNull();
  });

  it('passes the total, the slices and the hole to the render-prop', () => {
    mounted = mountChart(
      <>
        <PieSeries data={slices} options={donut} />
        <PieCenter>
          {({ total, slices: rows, hovered, hole }) => (
            <span data-probe="">{`${total}|${rows.length}|${hovered === null}|${hole.innerRadius > 0}`}</span>
          )}
        </PieCenter>
      </>,
    );
    mounted.flushScheduler();
    act(() => {});

    expect(mounted.container.querySelector('[data-probe]')?.textContent).toBe('100|3|true|true');
  });
});
