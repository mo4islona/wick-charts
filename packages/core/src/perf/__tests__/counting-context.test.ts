import { describe, expect, it, vi } from 'vitest';

import { createCountingContext } from '../counting-context';

function makeFakeContext(): CanvasRenderingContext2D {
  // Only the handful of methods / props our assertions touch — enough to prove
  // the Proxy forwards correctly without pulling in happy-dom.
  const state = { fillStyle: '#000000', lineWidth: 1 };
  const methods = {
    fillRect: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 42 }) as TextMetrics),
  };

  return new Proxy(state as unknown as CanvasRenderingContext2D, {
    get(target, prop) {
      if (prop in methods) return (methods as Record<string, unknown>)[prop as string];

      return (target as unknown as Record<string, unknown>)[prop as string];
    },
    set(target, prop, value) {
      (target as unknown as Record<string, unknown>)[prop as string] = value;

      return true;
    },
  });
}

describe('createCountingContext', () => {
  it('increments the tally each time a method is invoked', () => {
    const tally = new Map<string, number>();
    const counting = createCountingContext(makeFakeContext(), tally);

    counting.fillRect(0, 0, 10, 10);
    counting.fillRect(0, 0, 10, 10);
    counting.stroke();

    expect(tally.get('fillRect')).toBe(2);
    expect(tally.get('stroke')).toBe(1);
  });

  it('returns the real method return value through the wrapper', () => {
    const tally = new Map<string, number>();
    const counting = createCountingContext(makeFakeContext(), tally);

    const measured = counting.measureText('hello');

    expect(measured.width).toBe(42);
    expect(tally.get('measureText')).toBe(1);
  });

  it('does not count property reads or assignments', () => {
    const tally = new Map<string, number>();
    const counting = createCountingContext(makeFakeContext(), tally);

    counting.fillStyle = 'red';
    // Read to exercise the Proxy get trap; the result is intentionally discarded.
    void counting.lineWidth;

    expect(tally.size).toBe(0);
  });

  it('memoizes the method wrapper so repeated reads return the same function', () => {
    const tally = new Map<string, number>();
    const counting = createCountingContext(makeFakeContext(), tally);

    const first = counting.fillRect;
    const second = counting.fillRect;

    expect(first).toBe(second);
  });

  it('counts independent calls against a shared method name', () => {
    const tally = new Map<string, number>();
    const counting = createCountingContext(makeFakeContext(), tally);

    counting.beginPath();
    counting.moveTo(0, 0);
    counting.lineTo(10, 10);
    counting.stroke();
    counting.beginPath();

    expect(tally.get('beginPath')).toBe(2);
    expect(tally.get('moveTo')).toBe(1);
    expect(tally.get('lineTo')).toBe(1);
    expect(tally.get('stroke')).toBe(1);
  });

  /**
   * Regression: native `CanvasRenderingContext2D` getters/setters (`fillStyle`,
   * `lineWidth`, etc.) check internal slots and throw "Illegal invocation" if
   * invoked with any `this` other than a real context. Happy-dom's context
   * stub doesn't enforce this, which is why the bug only surfaced when the
   * chart ran in a real browser. These tests simulate the native behavior
   * with a strict-`this` stub.
   */
  describe('native-like this-binding', () => {
    /** A canvas stub whose fillStyle/lineWidth getter+setter throw unless invoked on the stub itself. */
    function makeStrictThisContext(): {
      ctx: CanvasRenderingContext2D;
      getFillStyle: () => string;
      getLineWidth: () => number;
    } {
      const slots = { fillStyle: '#000', lineWidth: 1 };
      const target = {};
      Object.defineProperty(target, 'fillStyle', {
        get(this: unknown) {
          if (this !== target) throw new TypeError('Illegal invocation');

          return slots.fillStyle;
        },
        set(this: unknown, v: string) {
          if (this !== target) throw new TypeError('Illegal invocation');
          slots.fillStyle = v;
        },
        configurable: true,
      });
      Object.defineProperty(target, 'lineWidth', {
        get(this: unknown) {
          if (this !== target) throw new TypeError('Illegal invocation');

          return slots.lineWidth;
        },
        set(this: unknown, v: number) {
          if (this !== target) throw new TypeError('Illegal invocation');
          slots.lineWidth = v;
        },
        configurable: true,
      });

      return {
        ctx: target as CanvasRenderingContext2D,
        getFillStyle: () => slots.fillStyle,
        getLineWidth: () => slots.lineWidth,
      };
    }

    it('routes setter assignments to the real context without throwing', () => {
      const { ctx, getFillStyle, getLineWidth } = makeStrictThisContext();
      const counting = createCountingContext(ctx, new Map());

      expect(() => {
        counting.fillStyle = '#abc';
        counting.lineWidth = 3;
      }).not.toThrow();

      expect(getFillStyle()).toBe('#abc');
      expect(getLineWidth()).toBe(3);
    });

    it('routes getter reads to the real context without throwing', () => {
      const { ctx } = makeStrictThisContext();
      const counting = createCountingContext(ctx, new Map());
      counting.fillStyle = '#def';

      expect(counting.fillStyle).toBe('#def');
    });
  });
});
