/**
 * Recording 2D context — proxied `CanvasRenderingContext2D` that captures every
 * method call with a snapshot of the drawing state at call time. Flips React
 * canvas coverage from 0% (prior Proxy stub) to full "what/where/in-what-order"
 * validation without a real rasterizer.
 *
 * Not exhaustive: only the state keys we actually assert on are snapshotted.
 * Extend `CAPTURED_STATE` / `GRADIENT_METHODS` as new renderers land.
 */

export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly fillStyle: string;
  readonly strokeStyle: string;
  readonly lineWidth: number;
  readonly font: string;
  readonly globalAlpha: number;
  readonly textAlign: CanvasTextAlign;
  readonly textBaseline: CanvasTextBaseline;
  readonly shadowColor: string;
  readonly shadowBlur: number;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
}

export interface CanvasRecorder {
  readonly calls: readonly RecordedCall[];
  callsOf(method: string): RecordedCall[];
  countOf(method: string): number;
  reset(): void;
  /**
   * `methods` must appear as a subsequence (order preserved, gaps allowed).
   * Example: `['beginPath', 'moveTo', 'lineTo', 'stroke']` matches a path even
   * when followed by more lineTos or style mutations.
   */
  matchesSequence(methods: string[]): boolean;
  /** Rough point-in-bbox lookup across recorded `fillRect` calls (reverse order). */
  fillStyleAt(x: number, y: number): string | null;
}

interface MutableState {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  filter: string;
}

const INITIAL_STATE = (): MutableState => ({
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 10,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  direction: 'inherit',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  shadowBlur: 0,
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low',
  filter: 'none',
});

const STATE_KEYS = new Set<keyof MutableState>(Object.keys(INITIAL_STATE()) as (keyof MutableState)[]);

interface FakeGradient {
  readonly __kind: 'linear' | 'radial' | 'conic';
  readonly stops: Array<{ offset: number; color: string }>;
  addColorStop(offset: number, color: string): void;
  toString(): string;
}

function makeGradient(kind: FakeGradient['__kind']): FakeGradient {
  const stops: Array<{ offset: number; color: string }> = [];
  return {
    __kind: kind,
    stops,
    addColorStop(offset, color) {
      stops.push({ offset, color });
    },
    toString() {
      const parts = stops.map((s) => `${s.offset}:${s.color}`).join(',');
      return `gradient(${kind};${parts})`;
    },
  };
}

function serializeStyle(style: unknown): string {
  if (typeof style === 'string') return style;
  if (style && typeof style === 'object' && 'toString' in style) return String(style);
  return String(style);
}

export interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  spy: CanvasRecorder;
}

/**
 * Build a recording context. The returned `ctx` is a `Proxy` safe to hand to
 * any renderer; unknown method calls are silently recorded as no-ops, so
 * evolving the renderer API won't break tests that don't touch the new calls.
 */
export function createRecordingContext(): RecordingContext {
  let state: MutableState = INITIAL_STATE();
  const stack: MutableState[] = [];
  const calls: RecordedCall[] = [];

  const snapshot = (): {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    font: string;
    globalAlpha: number;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    shadowColor: string;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
  } => ({
    fillStyle: serializeStyle(state.fillStyle),
    strokeStyle: serializeStyle(state.strokeStyle),
    lineWidth: state.lineWidth,
    font: state.font,
    globalAlpha: state.globalAlpha,
    textAlign: state.textAlign,
    textBaseline: state.textBaseline,
    shadowColor: state.shadowColor,
    shadowBlur: state.shadowBlur,
    shadowOffsetX: state.shadowOffsetX,
    shadowOffsetY: state.shadowOffsetY,
  });

  const record = (method: string, args: readonly unknown[]): void => {
    calls.push({ method, args, ...snapshot() });
  };

  // A handful of calls need a real return value (beyond `undefined`). Keep the
  // list narrow so we don't accidentally emulate full canvas semantics.
  const methodImpls: Record<string, (...args: unknown[]) => unknown> = {
    save: () => {
      stack.push({ ...state });
    },
    restore: () => {
      const prev = stack.pop();
      if (prev) state = prev;
    },
    createLinearGradient: () => makeGradient('linear'),
    createRadialGradient: () => makeGradient('radial'),
    createConicGradient: () => makeGradient('conic'),
    measureText: (text: unknown) => ({ width: typeof text === 'string' ? text.length * 6 : 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };

  const ctx = new Proxy({} as CanvasRenderingContext2D & { __spy: CanvasRecorder }, {
    get(_target, prop) {
      if (prop === '__spy') return spy;
      if (typeof prop !== 'string') return undefined;
      if (STATE_KEYS.has(prop as keyof MutableState)) {
        return state[prop as keyof MutableState];
      }
      const impl = methodImpls[prop];
      return (...args: unknown[]) => {
        record(prop, args);
        return impl?.(...args);
      };
    },
    set(_target, prop, value) {
      if (typeof prop === 'string' && STATE_KEYS.has(prop as keyof MutableState)) {
        (state as unknown as Record<string, unknown>)[prop] = value;
      }
      return true;
    },
    has(_target, prop) {
      return typeof prop === 'string' && (STATE_KEYS.has(prop as keyof MutableState) || prop in methodImpls);
    },
  });

  const spy: CanvasRecorder = {
    get calls() {
      return calls;
    },
    callsOf(method) {
      return calls.filter((c) => c.method === method);
    },
    countOf(method) {
      let n = 0;
      for (const c of calls) if (c.method === method) n++;
      return n;
    },
    reset() {
      calls.length = 0;
      stack.length = 0;
      state = INITIAL_STATE();
    },
    matchesSequence(methods) {
      if (methods.length === 0) return true;
      let i = 0;
      for (const c of calls) {
        if (c.method === methods[i]) {
          i++;
          if (i === methods.length) return true;
        }
      }
      return false;
    },
    fillStyleAt(x, y) {
      // Scan from the most recent `fillRect` backwards — later paints cover earlier ones.
      for (let i = calls.length - 1; i >= 0; i--) {
        const c = calls[i];
        if (c.method !== 'fillRect') continue;
        const [rx, ry, rw, rh] = c.args as [number, number, number, number];
        if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
          return c.fillStyle;
        }
      }
      return null;
    },
  };

  return { ctx, spy };
}
