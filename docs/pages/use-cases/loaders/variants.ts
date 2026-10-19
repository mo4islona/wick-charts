import {
  type LoadingIndicatorFn,
  auroraLoadingIndicator,
  condenseLoadingIndicator,
  dustLoadingIndicator,
  glassLoadingIndicator,
  halftoneLoadingIndicator,
} from '@wick-charts/react';

export type LoaderId = 'condense' | 'glass' | 'aurora' | 'halftone' | 'dust';

export interface LoaderVariant {
  id: LoaderId;
  label: string;
  /** True when its candle placeholders feed `skeletonMorphIntro`. */
  morphs: boolean;
  /** The export the live code sample names. */
  codeName: string;
  note: string;
  indicator: LoadingIndicatorFn;
}

export const LOADER_VARIANTS: LoaderVariant[] = [
  {
    id: 'condense',
    label: 'Condense',
    morphs: true,
    codeName: 'condenseLoadingIndicator',
    note: 'Placeholders assemble from drifting grains, hold, then scatter.',
    indicator: condenseLoadingIndicator,
  },
  {
    id: 'glass',
    label: 'Glass',
    morphs: true,
    codeName: 'glassLoadingIndicator',
    note: 'Frosted placeholders in the accent color, as wide as the real candles, bars or line.',
    indicator: glassLoadingIndicator,
  },
  {
    id: 'aurora',
    label: 'Aurora',
    morphs: false,
    codeName: 'auroraLoadingIndicator',
    note: 'An accent light curtain with a wavering seam where the history ends.',
    indicator: auroraLoadingIndicator,
  },
  {
    id: 'halftone',
    label: 'Halftone',
    morphs: false,
    codeName: 'halftoneLoadingIndicator',
    note: 'A dot grid: a ridge of swollen dots carries the last value on; dot columns for bars.',
    indicator: halftoneLoadingIndicator,
  },
  {
    id: 'dust',
    label: 'Dust',
    morphs: false,
    codeName: 'dustLoadingIndicator',
    note: 'Motes stream in and converge on the boundary value.',
    indicator: dustLoadingIndicator,
  },
];
