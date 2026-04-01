import { BarSeries, ChartContainer, Crosshair, PriceAxis, StackedBarSeries, TimeAxis } from "../../src";
import type { LineData } from "../../src/core/types";
import type { ChartTheme } from "../../src/theme/types";
import { Cell } from "../components/Cell";
import { generateBarData } from "../data";
import { useLineStreams } from "../hooks";

const basicBar = generateBarData(80, 240);
const wideBar = generateBarData(50, 600);
const denseBar = generateBarData(120, 120);

// Stacked: 3 layers of positive-only data
function genStackLayer(count: number, base: number, interval: number): LineData[] {
  const data: LineData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const start = now - count * interval;
  for (let i = 0; i < count; i++) {
    data.push({ time: start + i * interval, value: Math.round(base + Math.random() * base * 0.8) });
  }
  return data;
}
const stackLayer1 = genStackLayer(80, 40, 240);
const stackLayer2 = genStackLayer(80, 30, 240);
const stackLayer3 = genStackLayer(80, 20, 240);

function BasicBar({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([basicBar], 300);
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

function ColoredBar({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([wideBar], 400);
  return (
    <ChartContainer theme={theme}>
      <BarSeries
        data={datasets[0]}
        options={{ positiveColor: theme.line.color, negativeColor: theme.bands.lower, barWidthRatio: 0.8 }}
      />
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function StackedBar({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([stackLayer1, stackLayer2, stackLayer3], 500);
  return (
    <ChartContainer theme={theme}>
      <StackedBarSeries data={datasets} options={{ colors: theme.seriesColors.slice(0, 3), barWidthRatio: 0.6 }} />
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function DenseBar({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([denseBar], 500);
  return (
    <ChartContainer theme={theme}>
      <BarSeries
        data={datasets[0]}
        options={{ positiveColor: theme.seriesColors[2], negativeColor: theme.seriesColors[4], barWidthRatio: 0.4 }}
      />
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export function BarPage({ theme }: { theme: ChartTheme }) {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, height: "100%" }}
    >
      <Cell label="P&L Delta" sub="Up/Down" theme={theme}>
        <BasicBar theme={theme} />
      </Cell>
      <Cell label="Revenue" sub="Custom colors · wide" theme={theme}>
        <ColoredBar theme={theme} />
      </Cell>
      <Cell label="Breakdown" sub="Stacked · 3 layers" theme={theme}>
        <StackedBar theme={theme} />
      </Cell>
      <Cell label="Net Flow" sub="Thin bars" theme={theme}>
        <DenseBar theme={theme} />
      </Cell>
    </div>
  );
}
