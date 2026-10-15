import type { YScale } from '../scales/y-scale';

/**
 * A running stack on a non-linear Y axis whose layers can be partly present
 * (a fade, an entrance). A partial layer's top edge moves from the edge below
 * toward its full top in scale space, so it travels at an even pixel speed,
 * and the layers above stack on the value that edge stands for. A layer at
 * weight 0 adds nothing, so dropping it moves nothing.
 */
export class ScaleStack {
  readonly #yScale: YScale;
  /** Drawn top edge so far — starts at the plot floor when 0 has no place on the axis. */
  #edge: number;
  /** Data value the stack so far stands for; trails `#edge` while a floor stand-in fades out. */
  #sum = 0;

  constructor(yScale: YScale) {
    this.#yScale = yScale;
    this.#edge = yScale.baselineValue();
  }

  get edge(): number {
    return this.#edge;
  }

  /** Stacks `weight` of `value` (weight in `[0, 1]`) and returns the new top edge. */
  push(value: number, weight: number): number {
    if (value === 0) return this.#edge;

    const full = this.#sum + value;
    if (weight === 1) {
      this.#edge = full;
      this.#sum = full;

      return full;
    }

    const edge = this.#yScale.lerpValue(this.#edge, full, weight);
    this.#sum = edge - (this.#edge - this.#sum) * (1 - weight);
    this.#edge = edge;

    return edge;
  }
}
