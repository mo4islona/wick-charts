import type { YAxisPosition } from '../types';

/** CSS px from a Y tick label to the column's outer edge; `mountAxisLabels` anchors the labels there. */
export const Y_LABEL_INSET_PX = 8;

/** CSS px kept between a Y tick label and the plot. */
const Y_LABEL_GAP_PX = 8;

/** Distinct label texts a meter keeps before it starts over. */
const MAX_CACHED_TEXTS = 512;

/** How far elements reach into the chart from each side, in CSS px. */
export type ColumnReach = Record<YAxisPosition, number>;

/**
 * Measures Y tick labels to size an `'auto'` axis column. Each digit is
 * measured as `0`: the labels render with tabular figures, and a column
 * sized for `11.1` then also holds `88.8`.
 */
export class AxisLabelMeter {
  // `undefined` until the first measure; `null` where no 2D canvas exists.
  #context: CanvasRenderingContext2D | null | undefined;
  #font = '';
  #widths = new Map<string, number>();

  /** Column width that holds the widest of `labels`; `null` without a canvas to measure on. */
  columnWidth(params: { labels: readonly string[]; font: string }): number | null {
    const context = this.#resolveContext();
    if (context === null) return null;

    if (params.font !== this.#font) {
      this.#font = params.font;
      this.#widths.clear();
    }

    let widest = 0;
    for (const label of params.labels) {
      widest = Math.max(widest, this.#measure(context, label));
    }

    return Math.ceil(widest) + Y_LABEL_INSET_PX + Y_LABEL_GAP_PX;
  }

  /** Forget the measured widths — a web font that loaded late changes them. */
  clear(): void {
    this.#widths.clear();
  }

  #measure(context: CanvasRenderingContext2D, label: string): number {
    const text = label.replace(/\d/g, '0');
    const cached = this.#widths.get(text);
    if (cached !== undefined) return cached;

    if (this.#widths.size >= MAX_CACHED_TEXTS) this.#widths.clear();

    context.font = this.#font;
    const width = context.measureText(text).width;
    this.#widths.set(text, width);

    return width;
  }

  #resolveContext(): CanvasRenderingContext2D | null {
    if (this.#context !== undefined) return this.#context;

    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    this.#context = canvas?.getContext('2d') ?? null;

    return this.#context;
  }
}

/**
 * How far `elements` reach into `host` from its nearer side — a value badge
 * pinned to the right edge reaches in from the right by its offset plus its width.
 */
export function measureColumnReach(params: { host: HTMLElement; elements: Iterable<HTMLElement> }): ColumnReach {
  const reach: ColumnReach = { left: 0, right: 0 };
  const host = params.host.getBoundingClientRect();

  for (const el of params.elements) {
    if (!el.isConnected) continue;

    const box = el.getBoundingClientRect();
    if (box.width <= 0) continue;

    const fromLeft = box.right - host.left;
    const fromRight = host.right - box.left;
    const side: YAxisPosition = fromLeft < fromRight ? 'left' : 'right';
    reach[side] = Math.max(reach[side], Math.min(fromLeft, fromRight));
  }

  return reach;
}
