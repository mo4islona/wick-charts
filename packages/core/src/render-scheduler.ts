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
