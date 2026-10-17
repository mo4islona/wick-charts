import { useEffect, useRef } from 'react';

import { type ChartTheme, useChartInstance } from '@wick-charts/react';

import { isDarkColor } from '../../../utils';
import { type Head, ParticleField } from './particles';
import { DARK_PALETTE, LIGHT_PALETTE, SparkRenderer } from './renderer';

/** A burning front, as a fraction of the plot area: `{ x: 0, y: 0 }` is its top-left corner. */
export interface SparklerHead {
  x: number;
  y: number;
}

/**
 * Line colors lifted from the spark heat ramp, so the chart burns in the same
 * fire: `color` is the orange stop, `hot` the gold one.
 */
export function sparklerColors(theme: ChartTheme): { color: string; hot: string } {
  if (isDarkColor(theme.background)) return { color: '#ff6a14', hot: '#ffc04d' };

  return { color: '#d94000', hot: '#ff8a00' };
}

/** After this long without a feed the intro has ended and the heads burn out. */
const STALE_MS = 120;

/**
 * The bridge between the intro fn — the one place that knows where the reveal
 * fronts are each frame — and the overlay that throws sparks from them.
 */
export class Sparkler {
  heads: readonly SparklerHead[] = [];
  progress = 0;
  fedAt = Number.NEGATIVE_INFINITY;

  readonly #listeners = new Set<() => void>();

  feed(frame: { progress: number; heads: readonly SparklerHead[] }): void {
    this.heads = frame.heads;
    this.progress = frame.progress;
    this.fedAt = performance.now();

    for (const listener of this.#listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/**
 * Throws sparks from the heads a {@link Sparkler} is fed. The sparks are drawn
 * on a fixed, full-viewport WebGL canvas, so they spill past the chart onto the
 * page; this component itself only renders an invisible anchor that locates
 * the chart on screen.
 */
export function SparklerOverlay({ sparkler, theme }: { sparkler: Sparkler; theme: ChartTheme }) {
  const chart = useChartInstance();
  const anchorRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef(true);
  darkRef.current = isDarkColor(theme.background);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '20',
    });
    document.body.appendChild(canvas);

    const renderer = SparkRenderer.create(canvas);
    if (renderer === null) {
      canvas.remove();

      return;
    }

    const field = new ParticleField();
    let previous: Head[] = [];
    let ignited = false;
    let burntOut: boolean[] = [];
    let frameId = 0;
    let lastTime = 0;

    const burnOut = (head: Head) => {
      field.burst({ x: head.x, y: head.y, count: 260, speed: 700 });
    };

    // performance.now(), not the rAF timestamp: `fedAt` is stamped with it, and
    // the rAF timestamp is the frame start, which can predate the last feed.
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(Math.max(0, now - lastTime) / 1000, 1 / 30);
      lastTime = now;

      const { chartArea } = chart.getLayout();
      const rect = anchor.getBoundingClientRect();
      const burning = now - sparkler.fedAt < STALE_MS && sparkler.progress < 1;

      field.step(dt);

      if (burning) {
        const heads = sparkler.heads.map((head, index): Head => {
          const x = Math.min(1, Math.max(0, head.x)) * chartArea.width;
          const y = head.y * chartArea.height;
          const before = previous[index];
          if (before === undefined || dt === 0) return { x, y, vx: 0, vy: 0 };

          return { x, y, vx: (x - before.x) / dt, vy: (y - before.y) / dt };
        });

        if (!ignited && heads.length > 0) {
          ignited = true;
          burntOut = heads.map(() => false);
          field.burst({ x: heads[0].x, y: heads[0].y, count: 700, speed: 1200 });
        }

        heads.forEach((head, index) => {
          if (burntOut[index]) return;

          // A front that runs off the pane edge burns out there instead of flying across the page.
          const raw = sparkler.heads[index]?.x ?? 0.5;
          if (raw <= 0 || raw >= 1) {
            burntOut[index] = true;
            burnOut(head);

            return;
          }

          field.spray(head, dt);
          field.light(head);
        });

        previous = heads;
      } else if (ignited && burntOut.includes(false)) {
        previous.forEach((head, index) => {
          if (burntOut[index]) return;

          burntOut[index] = true;
          burnOut(head);
        });
      }

      renderer.resize();
      renderer.draw({
        count: field.pack(),
        instances: field.instances,
        origin: { x: rect.left + chartArea.x, y: rect.top + chartArea.y },
        palette: darkRef.current ? DARK_PALETTE : LIGHT_PALETTE,
      });

      if (burning || field.alive) {
        frameId = requestAnimationFrame(tick);

        return;
      }

      frameId = 0;
      renderer.clear();
    };

    const wake = () => {
      if (frameId !== 0) return;

      lastTime = performance.now();
      frameId = requestAnimationFrame(tick);
    };

    const unsubscribe = sparkler.subscribe(wake);

    return () => {
      cancelAnimationFrame(frameId);
      unsubscribe();
      renderer.dispose();
      canvas.remove();
    };
  }, [chart, sparkler]);

  return <div ref={anchorRef} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }} />;
}
