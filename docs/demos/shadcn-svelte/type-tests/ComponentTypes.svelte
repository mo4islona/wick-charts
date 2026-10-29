<script lang="ts">
// Type fixture for `@wick-charts/svelte` on Svelte 5, checked by `pnpm --filter shadcn-svelte-demo check`
// (strict, warnings fail). Never rendered.

import type {
  ChartInstance,
  GaugeSeriesProps,
  LineSeriesProps,
  OHLCData,
  OHLCInput,
  PieLegendRenderContext,
  SankeyTooltipProps,
  SankeyTooltipRenderContext,
  TitleProps,
  TooltipRenderContext,
} from '@wick-charts/svelte';
import {
  ChartContainer,
  GaugeSeries,
  LineSeries,
  Navigator,
  PieLegend,
  SankeyTooltip,
  Title,
  Tooltip,
} from '@wick-charts/svelte';
import type { Component, ComponentProps, Snippet } from 'svelte';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const candles: OHLCInput[] = $state([{ time: new Date(0), open: 1, high: 2, low: 0.5, close: 1.5 }]);

// Components are `Component`s, and `ComponentProps` matches the exported props types.
const line: Component<ComponentProps<typeof LineSeries>> = LineSeries;
const gauge: Component<GaugeSeriesProps> = GaugeSeries;
const byName: Record<string, Component<LineSeriesProps>> = { line: LineSeries };
const sameGauge: Equals<ComponentProps<typeof GaugeSeries>, GaugeSeriesProps> = true;

// A snippet prop takes the slot payload, and a `Snippet` typed elsewhere fits it...
const sankeyArg: Equals<Parameters<NonNullable<SankeyTooltipProps['children']>>[0], SankeyTooltipRenderContext> = true;
const legendProps = (children: Snippet<[PieLegendRenderContext]>): ComponentProps<typeof PieLegend> => ({ children });
// ...and back: a wrapper can `{@render}` the snippet prop it forwards.
const forwarded = (props: ComponentProps<typeof Tooltip>): Snippet<[TooltipRenderContext]> | undefined =>
  props.children;
const titleSnippet = (sub: Snippet): TitleProps => ({ sub });
const titleString: TitleProps = { sub: 'BTC' };
// @ts-expect-error -- the payload is typed, not `any`
const wrongArg = (children: Snippet<[{ nope: number }]>): ComponentProps<typeof Tooltip> => ({ children });

const lastClose = (chart: ChartInstance) => chart.getDataAtTime<OHLCData>('candles', 0)?.close;

void [line, gauge, byName, sameGauge, sankeyArg, legendProps, forwarded, titleSnippet, titleString, wrongArg];
void lastClose;
</script>

{#snippet tooltipBody(ctx: TooltipRenderContext)}
  <span>{ctx.snapshots.length} {ctx.time}</span>
{/snippet}

<ChartContainer>
  <Title>
    BTC
    {#snippet sub()}<b>Binance</b>{/snippet}
  </Title>
  <LineSeries data={[]} options={{ area: { baseline: 0 } }} />
  <Tooltip>
    {#snippet children({ snapshots, time })}
      <span>{snapshots.length} {time.toFixed(0)}</span>
    {/snippet}
  </Tooltip>
  <Tooltip children={tooltipBody} />
  <SankeyTooltip>
    {#snippet children({ info, format })}
      <span>{info.label} {format(info.value)}</span>
    {/snippet}
  </SankeyTooltip>
  <PieLegend>
    {#snippet children({ slices, mode, format })}
      <span>{slices.length} {mode} {format(1)}</span>
    {/snippet}
  </PieLegend>
  <Navigator data={{ type: 'candlestick', points: candles }} />
</ChartContainer>
