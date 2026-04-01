import { useMemo, useState } from "react";
import { ChartContainer, Crosshair, LineSeries, PriceAxis, TimeAxis, Tooltip } from "../../src";
import type { LineData } from "../../src/core/types";
import type { ChartTheme } from "../../src/theme/types";
import { Cell } from "../components/Cell";
import { generateLineData, generateWaveData } from "../data";
import { useLineStreams } from "../hooks";

type DataMode = "wave" | "line";
type StreamMode = "realtime" | "static";

function makeData(mode: DataMode, count: number, index: number): LineData[] {
  if (mode === "wave") {
    return generateWaveData(count, {
      base: 5,
      amplitude: 100 + index * 40,
      period: 50 + index * 15,
      phase: index * 0.12,
      onset: index * 0.06,
    });
  }
  return generateLineData(count, 80 + index * 30, 60);
}

// ── Chart wrappers ─────────────────────────────────────────────

function SingleLine({ theme, allData, streaming }: { theme: ChartTheme; allData: LineData[][]; streaming: boolean }) {
  const { datasets } = useLineStreams(allData, 300);
  const data = streaming ? datasets[0] : allData[0];
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <LineSeries data={data} onSeriesId={setSid} options={{ areaFill: false, lineWidth: 1 }} />
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function SingleArea({ theme, allData, streaming }: { theme: ChartTheme; allData: LineData[][]; streaming: boolean }) {
  const { datasets } = useLineStreams(allData, 400);
  const data = streaming ? datasets[0] : allData[0];
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <LineSeries data={data} onSeriesId={setSid} options={{ areaFill: true, lineWidth: 1 }} />
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function MultiLine({ theme, allData, streaming }: { theme: ChartTheme; allData: LineData[][]; streaming: boolean }) {
  const { datasets } = useLineStreams(allData, 500);
  const display = streaming ? datasets : allData;
  return (
    <ChartContainer theme={theme}>
      {display.map((d, i) => (
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

function MultiArea({ theme, allData, streaming }: { theme: ChartTheme; allData: LineData[][]; streaming: boolean }) {
  const { datasets } = useLineStreams(allData, 500);
  const display = streaming ? datasets : allData;
  return (
    <ChartContainer theme={theme}>
      {display.map((d, i) => (
        <LineSeries
          key={i}
          data={d}
          options={{ color: theme.seriesColors[i % theme.seriesColors.length], areaFill: true, lineWidth: 1 }}
        />
      ))}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

// ── Controls ───────────────────────────────────────────────────

function Toggle({
  label,
  options,
  value,
  onChange,
  theme,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: any) => void;
  theme: ChartTheme;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontSize: theme.typography.axisFontSize,
          color: theme.axis.textColor,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? theme.crosshair.labelBackground : "transparent",
            color: value === opt.value ? theme.tooltip.textColor : theme.axis.textColor,
            border: "none",
            padding: "3px 8px",
            borderRadius: 3,
            fontSize: theme.typography.axisFontSize,
            fontFamily: "inherit",
            fontWeight: value === opt.value ? 600 : 400,
            cursor: "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────

const MULTI_COUNT = 6;

export function LinePage({ theme }: { theme: ChartTheme }) {
  const [dataMode, setDataMode] = useState<DataMode>("wave");
  const [streamMode, setStreamMode] = useState<StreamMode>("realtime");

  // Regenerate data when mode changes
  const singleData = useMemo(() => [makeData(dataMode, 300, 0)], [dataMode]);
  const multiData = useMemo(
    () => Array.from({ length: MULTI_COUNT }, (_, i) => makeData(dataMode, 300, i)),
    [dataMode],
  );

  const streaming = streamMode === "realtime";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 6 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "4px 8px",
          borderRadius: 6,
          flexShrink: 0,
          border: `1px solid ${theme.tooltip.borderColor}`,
          background: theme.tooltip.background,
        }}
      >
        <Toggle
          label="Data"
          options={[
            { value: "wave", label: "Wave" },
            { value: "line", label: "Random" },
          ]}
          value={dataMode}
          onChange={setDataMode}
          theme={theme}
        />
        <div style={{ width: 1, height: 16, background: theme.tooltip.borderColor }} />
        <Toggle
          label="Mode"
          options={[
            { value: "realtime", label: "Realtime" },
            { value: "static", label: "Static" },
          ]}
          value={streamMode}
          onChange={setStreamMode}
          theme={theme}
        />
      </div>

      {/* Charts 2x2 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 6,
        }}
      >
        <Cell label="Line" sub="Single" theme={theme}>
          <SingleLine key={`${dataMode}-${streamMode}-sl`} theme={theme} allData={singleData} streaming={streaming} />
        </Cell>
        <Cell label="Area" sub="Single · fill" theme={theme}>
          <SingleArea key={`${dataMode}-${streamMode}-sa`} theme={theme} allData={singleData} streaming={streaming} />
        </Cell>
        <Cell label="Multi-Line" sub={`${MULTI_COUNT} series`} theme={theme}>
          <MultiLine key={`${dataMode}-${streamMode}-ml`} theme={theme} allData={multiData} streaming={streaming} />
        </Cell>
        <Cell label="Multi-Area" sub={`${MULTI_COUNT} series · fill`} theme={theme}>
          <MultiArea key={`${dataMode}-${streamMode}-ma`} theme={theme} allData={multiData} streaming={streaming} />
        </Cell>
      </div>
    </div>
  );
}
