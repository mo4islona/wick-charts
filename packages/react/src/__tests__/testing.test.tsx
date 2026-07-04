import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChartContainer } from '../ChartContainer';
import { LineSeries } from '../LineSeries';
import { type CanvasMockHandle, installCanvasMock } from '../testing';

/**
 * `@wick-charts/react/testing` is the public jsdom/happy-dom harness for a
 * consumer's own test suite — this repo's global `test-setup.ts` already
 * installs an equivalent mock for every test file, so these assertions
 * exercise `installCanvasMock()`'s own contract (working canvas, resize
 * plumbing, clean uninstall) rather than "does a chart render", which the
 * rest of the suite already covers extensively.
 */
describe('installCanvasMock', () => {
  let handle: CanvasMockHandle | null = null;

  afterEach(() => {
    handle?.uninstall();
    handle = null;
  });

  it('installs a working 2D context whose draw calls are recorded on canvas.__spy', () => {
    handle = installCanvasMock();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    expect(ctx).not.toBeNull();

    ctx?.fillRect(1, 2, 3, 4);

    expect(canvas.__spy).toBeDefined();
    expect(canvas.__spy?.countOf('fillRect')).toBe(1);
    expect(canvas.__spy?.calls[0].args).toEqual([1, 2, 3, 4]);
  });

  it('leaves non-2d context requests untouched', () => {
    handle = installCanvasMock();

    const canvas = document.createElement('canvas');
    // happy-dom/jsdom return null for unsupported context kinds — the mock
    // must forward the call rather than substituting its own recorder.
    const webgl = canvas.getContext('webgl');
    expect(webgl).toBeNull();
  });

  it('triggerResize fires every registered ResizeObserver callback with the given size', () => {
    handle = installCanvasMock();

    const seen: Array<{ width: number; height: number }> = [];
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentRect;
        seen.push({ width: box.width, height: box.height });
      }
    });
    observer.observe(document.createElement('div'));

    handle.triggerResize(640, 480);

    expect(seen).toEqual([{ width: 640, height: 480 }]);
  });

  it('uninstall() leaves a functioning environment for a subsequent install', () => {
    handle = installCanvasMock();
    handle.uninstall();
    handle = null;

    // A fresh install after a clean disconnect (the realistic beforeEach/
    // afterEach usage) still works end to end.
    handle = installCanvasMock();
    let calls = 0;
    const observer = new ResizeObserver(() => {
      calls++;
    });
    observer.observe(document.createElement('div'));
    handle.triggerResize(100, 100);
    expect(calls).toBe(1);
    observer.disconnect();
  });

  it('is sufficient on its own to mount <ChartContainer> and see canvas draw calls — the reason this subpath exists', async () => {
    handle = installCanvasMock();

    // happy-dom/jsdom don't run real layout — every element reports a 0×0
    // `getBoundingClientRect` unless a test stubs it. `installCanvasMock()`
    // deliberately doesn't do this (there's no one-size-fits-all container
    // shape to assume); a consumer's own harness patches it exactly like
    // this repo's own `mountChart()` test helper does.
    const width = 800;
    const height = 400;
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = function patched() {
      const r = origRect.call(this);
      if (r.width > 0 && r.height > 0) return r;

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
        toJSON: () => ({}),
      } as DOMRect;
    };

    const host = document.createElement('div');
    document.body.appendChild(host);

    act(() => {
      render(
        <ChartContainer>
          <LineSeries
            data={[
              { time: 1, value: 1 },
              { time: 2, value: 2 },
            ]}
          />
        </ChartContainer>,
        { container: host },
      );
    });

    // Chart rendering is scheduled on requestAnimationFrame — the mock
    // doesn't control the clock (out of scope: canvas/ResizeObserver/
    // matchMedia only), so a consumer's test fires the ResizeObserver-driven
    // layout pass via `triggerResize` and awaits a real frame for the paint.
    handle.triggerResize(width, height);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const canvas = host.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.__spy?.calls.length ?? 0).toBeGreaterThan(0);

    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    host.remove();
  });
});
