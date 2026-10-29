// Type-level checks: `tsc --noEmit` (`pnpm typecheck`) fails on a regression; at runtime they are no-ops.
import type {
  InfoBarRenderContext as ReactInfoBarRenderContext,
  PieLegendRenderContext as ReactPieLegendRenderContext,
  PieTooltipRenderContext as ReactPieTooltipRenderContext,
  SankeyTooltipRenderContext as ReactSankeyTooltipRenderContext,
  TooltipRenderContext as ReactTooltipRenderContext,
  YLabelRenderContext as ReactYLabelRenderContext,
} from '@wick-charts/react';
import { describe, expectTypeOf, it } from 'vitest';

import type {
  InfoBarRenderContext,
  NavigatorProps,
  OHLCInput,
  PieLegendRenderContext,
  PieTooltipRenderContext,
  SankeyTooltipRenderContext,
  TooltipRenderContext,
  YLabelRenderContext,
} from '../index';

describe('@wick-charts/vue public types', () => {
  it('names the slot payloads like the React render contexts', () => {
    expectTypeOf<SankeyTooltipRenderContext>().toEqualTypeOf<ReactSankeyTooltipRenderContext>();
    expectTypeOf<PieLegendRenderContext>().toEqualTypeOf<ReactPieLegendRenderContext>();
    expectTypeOf<PieTooltipRenderContext>().toEqualTypeOf<ReactPieTooltipRenderContext>();
    expectTypeOf<TooltipRenderContext>().toEqualTypeOf<ReactTooltipRenderContext>();
    expectTypeOf<InfoBarRenderContext>().toEqualTypeOf<ReactInfoBarRenderContext>();
    expectTypeOf<YLabelRenderContext>().toEqualTypeOf<ReactYLabelRenderContext>();
  });

  it('takes the series `OHLCInput[]` as navigator data', () => {
    expectTypeOf<{ data: { type: 'candlestick'; points: OHLCInput[] } }>().toMatchTypeOf<NavigatorProps>();
  });
});
