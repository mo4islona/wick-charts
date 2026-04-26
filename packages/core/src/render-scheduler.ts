/**
 * @deprecated 0.4 — superseded by {@link AnimationClock}. Kept as a thin shim
 * for any external code that imported `RenderScheduler` directly via deep-
 * import. Will be removed in 0.5.
 *
 * The two-scheduler setup (separate main + overlay RAF loops) was replaced
 * by a single shared frame clock that owns one RAF and dispatches main /
 * overlay paths with mutual exclusion. New code should not use this class.
 */
export type RenderCallback = (timestamp: DOMHighResTimeStamp) => void;

export class RenderScheduler {
  private dirty = false;
  private rafId: number | null = null;
  private readonly callback: RenderCallback;

  constructor(callback: RenderCallback) {
    this.callback = callback;
  }

  markDirty(): void {
    if (this.dirty) return;

    this.dirty = true;
    this.rafId = requestAnimationFrame(this.render);
  }

  private render = (timestamp: DOMHighResTimeStamp): void => {
    this.dirty = false;
    this.rafId = null;
    this.callback(timestamp);
  };

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dirty = false;
  }
}
