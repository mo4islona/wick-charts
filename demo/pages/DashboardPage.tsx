import { useState } from "react";
import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  Crosshair,
  LineSeries,
  PriceAxis,
  PriceLabel,
  TimeAxis,
  Tooltip,
} from "../../src";
import type { LineData } from "../../src/core/types";
import type { ChartTheme } from "../../src/theme/types";
import { Cell } from "../components/Cell";
import { generateBandLine, generateBarData, generateLineData, generateOHLCData, generateWaveData } from "../data";
import { useLineStreams, useOHLCStream } from "../hooks";

const ohlc = generateOHLCData(300, 42000, 60);
const ohlc2 = generateOHLCData(300, 3200, 60);
const areaLine: LineData[] = ohlc2.map((c) => ({ time: c.time, value: c.close }));
const upperBand = generateBandLine(ohlc2, 1.0);
const lowerBand = generateBandLine(ohlc2, -1.0);
const lines = Array.from({ length: 10 }, () => generateLineData(300, 100 + Math.random() * 200, 60));
const barData = generateBarData(100, 180);

function CandleChart({ theme }: { theme: ChartTheme }) {
  const { data } = useOHLCStream(ohlc, 300);
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <CandlestickSeries data={data} onSeriesId={setSid} />
      {sid && <PriceLabel seriesId={sid} />}
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function AreaBandsChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([areaLine, upperBand, lowerBand], 400);
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <LineSeries data={datasets[0]} onSeriesId={setSid} options={{ areaFill: true, lineWidth: 1 }} />
      <LineSeries data={datasets[1]} options={{ color: theme.bands.upper, areaFill: false, lineWidth: 1 }} />
      <LineSeries data={datasets[2]} options={{ color: theme.bands.lower, areaFill: false, lineWidth: 1 }} />
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function MultiLineChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams(lines, 500);
  return (
    <ChartContainer theme={theme}>
      {datasets.map((d, i) => (
        <LineSeries
          key={i}
          data={d}
          options={{ color: theme.seriesColors[i % theme.seriesColors.length], areaFill: false, lineWidth: 1 }}
        />
      ))}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function BarChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([barData], 600);
  return (
    <ChartContainer theme={theme}>
      <BarSeries
        data={datasets[0]}
        options={{ positiveColor: theme.candlestick.upColor, negativeColor: theme.candlestick.downColor }}
      />
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export function DashboardPage({ theme }: { theme: ChartTheme }) {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}
    >
      <Cell label="BTC/USD" sub="1m Candlestick" theme={theme}>
        <CandleChart theme={theme} />
      </Cell>
      <Cell label="ETH/USD" sub="1m Area + Bands" theme={theme}>
        <AreaBandsChart theme={theme} />
      </Cell>
      <Cell label="Portfolio" sub="10 assets · 1m" theme={theme}>
        <MultiLineChart theme={theme} />
      </Cell>
      <Cell label="P&L Delta" sub="1m Bar" theme={theme}>
        <BarChart theme={theme} />
      </Cell>
    </div>
  );
}
