// Type-level checks: `tsc --noEmit` (`pnpm typecheck`) fails on a regression; at runtime they are no-ops.
// `tsc` cannot read `.svelte` props; `docs/demos/shadcn-svelte/type-tests` covers those under svelte-check.
import type {
  InfoBarRenderContext as ReactInfoBarRenderContext,
  LegendItemOverride as ReactLegendItemOverride,
  LegendToggleInfo as ReactLegendToggleInfo,
  PieLegendRenderContext as ReactPieLegendRenderContext,
  PieTooltipRenderContext as ReactPieTooltipRenderContext,
  SankeyTooltipRenderContext as ReactSankeyTooltipRenderContext,
  TooltipRenderContext as ReactTooltipRenderContext,
  YLabelRenderContext as ReactYLabelRenderContext,
} from '@wick-charts/react';
import { describe, expectTypeOf, it } from 'vitest';

import type {
  InfoBarRenderContext,
  LegendItemOverride,
  LegendToggleInfo,
  PieLegendRenderContext,
  PieTooltipRenderContext,
  SankeyTooltipRenderContext,
  TooltipRenderContext,
  YLabelRenderContext,
} from '../index';

describe('@wick-charts/svelte public types', () => {
  it('names the slot payloads like the React render contexts', () => {
    expectTypeOf<SankeyTooltipRenderContext>().toEqualTypeOf<ReactSankeyTooltipRenderContext>();
    expectTypeOf<PieLegendRenderContext>().toEqualTypeOf<ReactPieLegendRenderContext>();
    expectTypeOf<PieTooltipRenderContext>().toEqualTypeOf<ReactPieTooltipRenderContext>();
    expectTypeOf<TooltipRenderContext>().toEqualTypeOf<ReactTooltipRenderContext>();
    expectTypeOf<InfoBarRenderContext>().toEqualTypeOf<ReactInfoBarRenderContext>();
    expectTypeOf<YLabelRenderContext>().toEqualTypeOf<ReactYLabelRenderContext>();
  });

  it('exports the legend helper types React exports', () => {
    expectTypeOf<LegendItemOverride>().toEqualTypeOf<ReactLegendItemOverride>();
    expectTypeOf<LegendToggleInfo>().toEqualTypeOf<ReactLegendToggleInfo>();
  });
});
