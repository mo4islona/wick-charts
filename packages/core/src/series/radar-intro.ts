/**
 * Pluggable first-data intros for the radar series.
 *
 * The renderer calls a {@link RadarIntroFn} once per polygon per frame while
 * the entry plays and draws what the returned {@link RadarIntroDirectives}
 * say. The web (rings, spokes, axis names) has its own fixed reveal. The
 * shipped styles are plain factories over this contract:
 *
 * ```ts
 * <RadarSeries options={{ introAnimation: radarScanIntro() }} />
 * ```
 */

import { easeInOutCubic, easeOutCubic } from '../animation/easing';
import { clamp, lerp } from '../utils/math';

/** Read view of one polygon in one intro frame. */
export interface RadarIntroFrame {
  /** Linear share of the entry played, `0`…`1`. */
  progress: number;
  /** Index of the polygon in the data. */
  layer: number;
  layerCount: number;
  axisCount: number;
}

/** One vertex handed to {@link RadarIntroDirectives.vertex}. */
export interface RadarIntroVertex {
  axis: number;
  /** The vertex's settled radius as a share of the web radius. */
  fraction: number;
  /** Mean of the polygon's settled fractions. */
  mean: number;
}

/** What to draw of one polygon this frame. Every field is optional; an empty object draws it settled. */
export interface RadarIntroDirectives {
  /** Drawn radius of a vertex as a share of the web radius. Default: its `fraction`. */
  vertex?: (vertex: RadarIntroVertex) => number;
  /** Turn of the polygon around the center, radians clockwise. Default: 0. */
  rotation?: number;
  /** Polygon opacity, `0`…`1`. Default: 1. */
  alpha?: number;
  /** Share of the turn drawn clockwise from the first axis, `0`…`1`; a scan beam rides its edge. Default: 1. */
  reveal?: number;
  /** Opacity of the vertex dots, `0`…`1`. Default: 1. */
  dots?: number;
}

/** A radar intro: directives for one polygon at one frame. */
export type RadarIntroFn = (frame: RadarIntroFrame) => RadarIntroDirectives;

/** Linear progress of a window `[start, start + span]` of the entry. */
function windowed(args: { progress: number; start: number; span: number }): number {
  return clamp((args.progress - args.start) / args.span, 0, 1);
}

/** Share of the entry each later polygon starts after the one before it. */
function layerDelay(args: { layer: number; layerCount: number; room: number }): number {
  const { layer, layerCount, room } = args;
  if (layerCount <= 1) return 0;

  return (room * layer) / (layerCount - 1);
}

/** Every polygon grows from the center, with a short clockwise sweep across the axes. */
export function radarGrowIntro(): RadarIntroFn {
  return ({ progress, layer, layerCount, axisCount }) => {
    const start = 0.12 + layerDelay({ layer, layerCount, room: 0.06 });

    return {
      vertex: ({ axis, fraction }) => {
        const sweep = (0.12 * axis) / Math.max(1, axisCount);
        const t = windowed({ progress, start: start + sweep, span: 0.7 });

        return fraction * easeOutCubic(t);
      },
      dots: easeOutCubic(windowed({ progress, start: 0.55, span: 0.45 })),
    };
  };
}

/** A radar beam sweeps clockwise from the first axis and leaves the polygons behind it. */
export function radarScanIntro(): RadarIntroFn {
  return ({ progress }) => ({
    reveal: easeInOutCubic(windowed({ progress, start: 0.1, span: 0.85 })),
  });
}

/** The polygons turn a quarter into place while they grow and fade in. */
export function radarSpinIntro(): RadarIntroFn {
  return ({ progress, layer, layerCount }) => {
    const t = easeOutCubic(
      windowed({ progress, start: 0.1 + layerDelay({ layer, layerCount, room: 0.1 }), span: 0.8 }),
    );

    return {
      vertex: ({ fraction }) => fraction * t,
      rotation: (-(1 - t) * Math.PI) / 2,
      alpha: t,
      dots: easeOutCubic(windowed({ progress, start: 0.6, span: 0.4 })),
    };
  };
}

/** The polygons arrive one after another, each growing from the center. */
export function radarCascadeIntro(): RadarIntroFn {
  return ({ progress, layer, layerCount }) => {
    const overlap = 0.55;
    const span = 0.88 / (1 + (layerCount - 1) * (1 - overlap));
    const start = 0.12 + layer * span * (1 - overlap);
    const t = windowed({ progress, start, span });

    return {
      vertex: ({ fraction }) => fraction * easeOutCubic(t),
      alpha: clamp(t * 2.5, 0, 1),
      dots: easeOutCubic(clamp((t - 0.6) / 0.4, 0, 1)),
    };
  };
}

/** Each polygon inflates to a regular shape at its mean, then sculpts into its values. */
export function radarInflateIntro(): RadarIntroFn {
  return ({ progress, layer, layerCount }) => {
    const delay = layerDelay({ layer, layerCount, room: 0.08 });
    const inflate = easeOutCubic(windowed({ progress, start: 0.1 + delay, span: 0.4 }));
    const sculpt = easeInOutCubic(windowed({ progress, start: 0.45 + delay, span: 0.47 }));

    return {
      vertex: ({ fraction, mean }) => lerp(mean * inflate, fraction, sculpt),
      dots: sculpt,
    };
  };
}
