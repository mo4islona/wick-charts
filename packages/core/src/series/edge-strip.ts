/** The strip under a right Y-axis column that the overlay clip reaches into, in pane-local bitmap px. */
export interface EdgeStrip {
  start: number;
  end: number;
}

/**
 * Alpha for an overlay dot of `radius` at `x`: whole until its edge enters the
 * strip, gone once the edge reaches the strip's end, so the clip there never
 * cuts it flat. A per-dot alpha, not a layer erase, so the crosshair the
 * overlay already faded is left alone.
 */
export function edgeStripAlpha(args: { strip: EdgeStrip | null; x: number; radius: number }): number {
  const { strip, x, radius } = args;
  if (strip === null) return 1;

  const reach = x + radius - strip.start;
  if (reach <= 0) return 1;

  const width = strip.end - strip.start;
  if (reach >= width) return 0;

  const t = reach / width;

  return 1 - t * t;
}
