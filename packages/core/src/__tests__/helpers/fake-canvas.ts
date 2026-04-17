import { type CanvasRecorder, createRecordingContext } from './recording-context';

/**
 * Minimal `HTMLCanvasElement`-shaped object for node-environment renderer tests.
 * Real `HTMLCanvasElement` requires jsdom/happy-dom; renderers only need
 * width/height + `getContext('2d')`, so this fake keeps core tests pure-node.
 *
 * `__spy` is attached for parity with the browser setup (see `react/test-setup.ts`).
 */
export interface FakeCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): CanvasRenderingContext2D;
  readonly __spy: CanvasRecorder;
}

export interface FakeCanvasHandle {
  canvas: FakeCanvas;
  ctx: CanvasRenderingContext2D;
  spy: CanvasRecorder;
}

export function createFakeCanvas(width = 800, height = 400): FakeCanvasHandle {
  const { ctx, spy } = createRecordingContext();
  const canvas: FakeCanvas = {
    width,
    height,
    getContext() {
      return ctx;
    },
    __spy: spy,
  };
  return { canvas, ctx, spy };
}
