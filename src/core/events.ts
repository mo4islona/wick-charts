type Listener = (...args: any[]) => void;

export class EventEmitter<Events = Record<string, Listener>> {
  private listeners = new Map<string, Set<Listener>>();

  on<K extends string & keyof Events>(event: K, listener: Events[K] & Listener): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off<K extends string & keyof Events>(event: K, listener: Events[K] & Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  protected emit<K extends string & keyof Events>(
    event: K,
    ...args: Events[K] extends (...a: infer A) => any ? A : never
  ): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
