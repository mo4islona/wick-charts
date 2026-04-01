import { useState } from "react";
import { CandlestickSeries, ChartContainer, Crosshair, PriceAxis, PriceLabel, TimeAxis, Tooltip } from "../../src";
import type { ChartTheme } from "../../src/theme/types";
import { Cell } from "../components/Cell";
import { generateOHLCData } from "../data";
import { useOHLCStream } from "../hooks";

const steadyData = generateOHLCData(300, 42000, 60);
const volatileData = generateOHLCData(300, 100, 60);
const trendingData = generateOHLCData(300, 1500, 60);

function Example({
  theme,
  data,
  label,
  sub,
}: {
  theme: ChartTheme;
  data: ReturnType<typeof generateOHLCData>;
  label: string;
  sub: string;
}) {
  const { data: d } = useOHLCStream(data, 200 + Math.random() * 400);
  const [sid, setSid] = useState<string | null>(null);
  return (
    <Cell label={label} sub={sub} theme={theme}>
      <ChartContainer theme={theme}>
        <CandlestickSeries data={d} onSeriesId={setSid} />
        {sid && <PriceLabel seriesId={sid} />}
        {sid && <Tooltip seriesId={sid} />}
        <Crosshair />
        <PriceAxis />
        <TimeAxis />
      </ChartContainer>
    </Cell>
  );
}

export function CandlestickPage({ theme }: { theme: ChartTheme }) {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr 1fr", gap: 6, height: "100%" }}
    >
      <Example theme={theme} data={steadyData} label="BTC/USD" sub="Standard · 1m" />
      <Example theme={theme} data={volatileData} label="DOGE/USD" sub="High volatility · 1m" />
      <Example theme={theme} data={trendingData} label="ETH/USD" sub="Trending · 1m" />
    </div>
  );
}
