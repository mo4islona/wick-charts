export type RenderCallback = (timestamp: DOMHighResTimeStamp) => void;

export class RenderScheduler {
  private dirty = false;
  private rafId: number | null = null;
  private readonly callback: RenderCallback;
  private readonly onVisibilityChange: (() => void) | null = null;

  constructor(callback: RenderCallback) {
    this.callback = callback;

    // Browsers pause RAF in hidden tabs, but some embedders (Electron with
    // backgroundThrottling off, certain webviews) keep firing it — a
    // self-perpetuating tick (line pulse, edge spinner) would then repaint an
    // invisible chart indefinitely. Gate the re-arm on visibility instead;
    // the owed frame fires on the next visible flip.
    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        if (!document.hidden && this.dirty && this.rafId === null) {
          this.rafId = requestAnimationFrame(this.render);
        }
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;

    if (typeof document !== 'undefined' && document.hidden) return; // re-armed on visibilitychange

    this.rafId = requestAnimationFrame(this.render);
  }

  /**
   * Drop the pending frame without rendering — for callers that just painted
   * the same content synchronously and would otherwise get a duplicate
   * callback later this frame. The next `markDirty` re-arms normally.
   */
  consume(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dirty = false;
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
    if (this.onVisibilityChange !== null) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }
}
