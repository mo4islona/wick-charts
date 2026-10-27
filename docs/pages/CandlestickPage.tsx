import { useMemo } from 'react';

import {
  type CandlePainter,
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  InfoBar,
  Navigator,
  type OHLCData,
  Title,
  Tooltip,
  XAxis,
  YAxis,
  YLabel,
  heikinAshi,
  hollowCandle,
  ohlcBar,
  perfHud,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import {
  buildCartesianContainerProps,
  buildCommonSeriesOptions,
  buildNavigatorComponent,
  useAnimationsProp,
} from '../components/playground/codeMappings';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';
import { generateOHLCData } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useIsMobile, useOHLCStream } from '../hooks';

type CandleStyle = 'filled' | 'hollow' | 'ohlc';
// `mixed` gives every chart its own style; the others apply one to all.
type CandleStyleSetting = 'mixed' | CandleStyle;
const CANDLE_STYLE_LABELS: Record<CandleStyle, string> = { filled: 'Filled', hollow: 'Hollow', ohlc: 'OHLC' };
// The first chart is the one the Code tab shows in `mixed`.
const MIXED_STYLES: [CandleStyle, CandleStyle, CandleStyle] = ['filled', 'ohlc', 'hollow'];
// `filled` is the default painter, so it maps to no option at all.
const CANDLE_PAINTERS: Record<CandleStyle, CandlePainter | undefined> = {
  filled: undefined,
  hollow: hollowCandle,
  ohlc: ohlcBar,
};
const CANDLE_PAINTER_REFS: Record<CandleStyle, string | undefined> = {
  filled: undefined,
  hollow: 'hollowCandle',
  ohlc: 'ohlcBar',
};

type CandleBodyWidth = 'thin' | 'normal' | 'wide';
// normal = 0.6 mirrors the core CandlestickSeries `bodyWidthRatio` default.
const CANDLE_BODY_MAP: Record<CandleBodyWidth, number> = { thin: 0.4, normal: 0.6, wide: 0.85 };

// Mirror the core CandlestickSeries cornerRadius default so the code preview
// only emits the prop when the slider diverges from it.
const CANDLE_DEFAULT_RADIUS = 2;

interface CandleSettings {
  candleStyle: CandleStyleSetting;
  heikinAshiEnabled: boolean;
  bodyWidth: CandleBodyWidth;
  cornerRadius: number;
  yLabelVisible: boolean;
  tooltipVisible: boolean;
  infoBarVisible: boolean;
  crosshairVisible: boolean;
}

// Zoom steps out from chart to chart; the bottom one is the wide view and
// scrolls with the stream. Generate the full buffers once at module level and
// slice per-viewport inside the page component.
const steadyDataFull = generateOHLCData(300, 42000, DEMO_INTERVAL);
const lowPriceDataFull = generateOHLCData(300, 0.0000081, DEMO_INTERVAL);
const trendingDataFull = generateOHLCData(300, 1500, DEMO_INTERVAL);

type CandleState = PlaygroundChartProps & CandleSettings;
type CardId = 'btc' | 'pepe' | 'eth';

interface CandleCard {
  id: CardId;
  title: string;
  sub: string;
  ownStyle: CandleStyle;
  /** Scroll with the stream from the start instead of zooming out. */
  follow?: boolean;
  showVolume?: boolean;
}

const CARDS: CandleCard[] = [
  { id: 'btc', title: 'BTC/USD', sub: 'Standard', ownStyle: MIXED_STYLES[0] },
  { id: 'pepe', title: 'PEPE/USDT', sub: 'Low price', ownStyle: MIXED_STYLES[1], showVolume: false },
  { id: 'eth', title: 'ETH/USD', sub: 'Trending', ownStyle: MIXED_STYLES[2], follow: true },
];

function styleOf(setting: CandleStyleSetting, card: CandleCard): CandleStyle {
  return setting === 'mixed' ? card.ownStyle : setting;
}

function cardSub(setting: CandleStyleSetting, card: CandleCard): string {
  return `${card.sub} · ${CANDLE_STYLE_LABELS[styleOf(setting, card)]}`;
}

function CandleChart({
  theme,
  axis,
  streaming,
  gradient,
  data,
  candleStyle,
  heikinAshiEnabled,
  bodyWidth,
  cornerRadius,
  yLabelVisible,
  tooltipVisible,
  infoBarVisible,
  crosshairVisible,
  navigatorVisible,
  navigatorHeight,
  perfHudVisible,
  candleEntryAnimation,
  headerLayout,
  card,
  ...rest
}: CandleState & { data: OHLCData[]; card: CandleCard }) {
  const style = styleOf(candleStyle, card);
  const showVolume = card.showVolume ?? true;
  // Capped at the history it starts with, the window is full at once: it scrolls instead of zooming out.
  const viewport = card.follow ? { maxVisibleBars: data.length } : undefined;

  // speed=5: virtual interval is 5s so each candle forms with visible intra
  // wobble, but wall-clock gives us one new bar per second — dense enough
  // for entrance animations to feel continuous, like the dashboard.
  const { data: d } = useOHLCStream(data, { interval: DEMO_INTERVAL, speed: 5 });
  const raw = streaming ? d : data;
  const display = useMemo(() => {
    const candles = heikinAshiEnabled ? heikinAshi(raw) : raw;
    if (showVolume) return candles;

    // The histogram draws only from the `volume` field.
    return candles.map(({ volume: _volume, ...candle }) => candle);
  }, [raw, heikinAshiEnabled, showVolume]);
  const sid = 'candle';
  const animations = useAnimationsProp({
    ...rest,
    candleEntryAnimation,
    headerLayout,
    streaming,
    gradient,
    perfHudVisible,
    navigatorVisible,
    navigatorHeight,
    theme,
    axis,
  } as PlaygroundChartProps);

  return (
    <ChartContainer
      theme={theme}
      axis={axis}
      gradient={gradient}
      headerLayout={headerLayout}
      perf={perfHudVisible ? perfHud() : undefined}
      animations={animations}
      viewport={viewport}
    >
      <Title sub={cardSub(candleStyle, card)}>{card.title}</Title>
      {infoBarVisible && <InfoBar />}
      <CandlestickSeries
        id={sid}
        data={display}
        options={{
          entryAnimation: candleEntryAnimation,
          bodyWidthRatio: CANDLE_BODY_MAP[bodyWidth],
          cornerRadius,
          candlePainter: CANDLE_PAINTERS[style],
        }}
      />
      {yLabelVisible && <YLabel seriesId={sid} />}
      {tooltipVisible && <Tooltip />}
      {crosshairVisible && <Crosshair />}
      {axis?.y?.visible !== false && <YAxis />}
      {axis?.x?.visible !== false && <XAxis />}
      {navigatorVisible && (
        <Navigator
          data={{
            type: 'line',
            points: display.map((p) => ({ time: p.time, value: p.close })),
          }}
          height={navigatorHeight}
        />
      )}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-candle',
  title: 'Display',
  extend: 'display',
  rows: [
    {
      key: 'yLabelVisible',
      label: 'Value label',
      hint: 'Last price on the Y axis',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'infoBarVisible',
      label: 'Info bar',
      hint: 'OHLC values above the chart',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'crosshairVisible',
      label: 'Crosshair',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const SERIES_SECTION: SectionSpec = {
  id: 'series',
  title: 'Series',
  icon: ICONS.series,
  rows: [
    {
      key: 'candleStyle',
      label: 'Style',
      hint: 'Mixed: one style per chart',
      render: (v, onChange) => (
        <ToggleGroup<CandleStyleSetting>
          value={v as CandleStyleSetting}
          options={[
            { value: 'mixed', label: 'Mixed' },
            { value: 'filled', label: 'Filled' },
            { value: 'hollow', label: 'Hollow' },
            { value: 'ohlc', label: 'OHLC' },
          ]}
          onChange={onChange as (v: CandleStyleSetting) => void}
        />
      ),
    },
    {
      key: 'heikinAshiEnabled',
      label: 'Heikin-Ashi',
      hint: 'Averaged candles',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'bodyWidth',
      label: 'Body width',
      render: (v, onChange) => (
        <ToggleGroup<CandleBodyWidth>
          value={v as CandleBodyWidth}
          options={[
            { value: 'thin', label: 'Thin' },
            { value: 'normal', label: 'Normal' },
            { value: 'wide', label: 'Wide' },
          ]}
          onChange={onChange as (v: CandleBodyWidth) => void}
        />
      ),
    },
    {
      key: 'cornerRadius',
      label: 'Corner radius',
      hint: '0 = square',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={8} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

function candleCode(args: { s: CandleState; card: CandleCard; bars: number }): ChartCodeConfig {
  const { s, card, bars } = args;
  const painterRef = CANDLE_PAINTER_REFS[styleOf(s.candleStyle, card)];
  const options: Record<string, PropValue> = {
    ...buildCommonSeriesOptions(s, 'candle'),
    ...(s.bodyWidth !== 'normal' ? { bodyWidthRatio: CANDLE_BODY_MAP[s.bodyWidth] } : {}),
    ...(s.cornerRadius !== CANDLE_DEFAULT_RADIUS ? { cornerRadius: s.cornerRadius } : {}),
    ...(painterRef !== undefined ? { candlePainter: painterRef } : {}),
  };

  const containerProps = buildCartesianContainerProps(s) ?? {};
  if (card.follow) containerProps.viewport = { maxVisibleBars: bars };

  const yVisible = s.axis.y?.visible !== false;
  const xVisible = s.axis.x?.visible !== false;

  return {
    title: { text: card.title, sub: cardSub(s.candleStyle, card) },
    theme: 'catppuccin.theme',
    containerProps: Object.keys(containerProps).length > 0 ? containerProps : undefined,
    components: [
      {
        component: 'CandlestickSeries',
        props: {
          id: 'sid',
          data: s.heikinAshiEnabled ? 'heikinAshi(ohlcData)' : 'ohlcData',
          ...(Object.keys(options).length > 0 ? { options } : {}),
        },
      },
      ...(s.infoBarVisible ? [{ component: 'InfoBar' }] : []),
      ...(s.yLabelVisible ? [{ component: 'YLabel', props: { seriesId: 'sid' } }] : []),
      ...(s.tooltipVisible ? [{ component: 'Tooltip' }] : []),
      ...(s.crosshairVisible ? [{ component: 'Crosshair' }] : []),
      ...(yVisible ? [{ component: 'YAxis' }] : []),
      ...(xVisible ? [{ component: 'XAxis' }] : []),
      ...buildNavigatorComponent(s, 'closePoints'),
    ],
  };
}

export function CandlestickPage({ theme }: { theme: ChartTheme }) {
  const mobile = useIsMobile();
  const dataOf = useMemo(() => {
    const steady = mobile ? 20 : 50;
    const lowPrice = mobile ? 25 : 55;
    const trending = mobile ? 50 : 120;

    return {
      btc: steadyDataFull.slice(-steady),
      pepe: lowPriceDataFull.slice(-lowPrice),
      eth: trendingDataFull.slice(-trending),
    } satisfies Record<CardId, OHLCData[]>;
  }, [mobile]);

  return (
    <Playground<CandleSettings>
      id="candlestick"
      theme={theme}
      extraDefaults={(m) => ({
        candleStyle: 'mixed',
        heikinAshiEnabled: false,
        bodyWidth: 'normal',
        cornerRadius: CANDLE_DEFAULT_RADIUS,
        yLabelVisible: true,
        tooltipVisible: false,
        infoBarVisible: !m,
        crosshairVisible: true,
      })}
      gridTemplate="1fr 1fr 1fr"
      animationKinds={['candle']}
      sections={[{ ...DISPLAY_EXTRA, icon: ICONS.display }, SERIES_SECTION]}
      charts={(props) =>
        CARDS.map((card) => (
          <Cell key={card.id} theme={props.theme} cardId={card.id}>
            <CandleChart
              key={`${card.id}-${props.streaming}-${props.perfHudVisible}-${mobile}`}
              {...props}
              data={dataOf[card.id]}
              card={card}
            />
          </Cell>
        ))
      }
      cards={(s): PlaygroundCard[] =>
        CARDS.map((card) => ({
          id: card.id,
          title: card.title,
          sub: cardSub(s.candleStyle, card),
          code: candleCode({ s, card, bars: dataOf[card.id].length }),
        }))
      }
    />
  );
}
