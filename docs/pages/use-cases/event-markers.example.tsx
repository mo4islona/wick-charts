import { useMemo, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  Marker,
  type MarkerShape,
  TimeAxis,
  Tooltip,
  YAxis,
} from '@wick-charts/react';

import { hexToRgba } from '../../utils';

const INTERVAL = 60_000; // one sample per minute
const COUNT = 64;
// Fixed epoch so the synthetic series is identical at build (prerender) and run time.
const START = 1_700_000_000_000;

// Story beats, as indices into the metric series.
const DEPLOY_I = 16;
const BROKE_I = 30;
const RECOVERED_I = 45;

// A calm baseline that spikes into an anomaly window, then recovers — so the
// markers pin a story the reader can follow at a glance.
function buildMetric(): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = [];

  for (let i = 0; i < COUNT; i++) {
    const time = START + i * INTERVAL;
    let value = 40 + Math.sin(i / 3) * 2;

    if (i >= BROKE_I && i < RECOVERED_I) {
      // Ramp up to a plateau, then ease back down across the incident window.
      const t = (i - BROKE_I) / (RECOVERED_I - BROKE_I);
      value += Math.sin(t * Math.PI) * 55;
    }

    out.push({ time, value: Math.round(value * 10) / 10 });
  }

  return out;
}

const SHAPES: MarkerShape[] = ['arrow-down', 'dot', 'circle', 'arrow-up'];

export function EventMarkersDemo({ theme }: { theme: ChartTheme }) {
  const metric = useMemo(buildMetric, []);
  const [shape, setShape] = useState<MarkerShape>('arrow-down');
  const [pulse, setPulse] = useState(true);

  const timeAt = (i: number) => metric[i].time;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Controls theme={theme} shape={shape} onShape={setShape} pulse={pulse} onPulse={setPulse} />

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartContainer theme={theme} style={{ width: '100%', height: '100%' }}>
          <LineSeries
            id="metric"
            data={{ label: 'requests/s', data: metric }}
            options={{ area: { visible: true }, strokeWidth: 1.5, pulse: false }}
          />
          {/* A release ship — snaps Y to the metric line at that time. */}
          <Marker time={timeAt(DEPLOY_I)} seriesId="metric" shape="dot" label="deploy v2.1.0" color="#6f9ef8" />
          {/* The anomaly opening — shape + pulse driven by the controls above. */}
          <Marker
            time={timeAt(BROKE_I)}
            seriesId="metric"
            shape={shape}
            pulse={pulse}
            label="anomaly"
            color="#f0556a"
          />
          {/* Recovery. */}
          <Marker time={timeAt(RECOVERED_I)} seriesId="metric" shape="dot" label="recovered" color="#46b78f" />
          <Tooltip />
          <Crosshair />
          <YAxis />
          <TimeAxis />
        </ChartContainer>
      </div>
    </div>
  );
}

interface ControlsProps {
  theme: ChartTheme;
  shape: MarkerShape;
  onShape: (next: MarkerShape) => void;
  pulse: boolean;
  onPulse: (next: boolean) => void;
}

function Controls({ theme, shape, onShape, pulse, onPulse }: ControlsProps) {
  const border = hexToRgba(theme.tooltip.textColor, 0.18);
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        padding: '0 0 10px',
        fontSize: theme.typography.fontSize - 1,
        fontFamily: theme.typography.fontFamily,
        color: muted,
      }}
    >
      <span>Anomaly marker:</span>

      <div style={{ display: 'inline-flex', border: `1px solid ${border}`, borderRadius: 6, overflow: 'hidden' }}>
        {SHAPES.map((s) => {
          const active = s === shape;

          return (
            <button
              key={s}
              type="button"
              onClick={() => onShape(s)}
              style={{
                padding: '5px 10px',
                border: 'none',
                background: active ? hexToRgba(theme.tooltip.textColor, 0.08) : 'transparent',
                color: active ? theme.tooltip.textColor : muted,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: active ? 500 : 400,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onPulse(!pulse)}
        aria-pressed={pulse}
        style={{
          padding: '5px 12px',
          border: `1px solid ${border}`,
          borderRadius: 6,
          background: pulse ? hexToRgba('#f0556a', 0.15) : 'transparent',
          color: pulse ? '#f0556a' : muted,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: pulse ? 500 : 400,
        }}
      >
        pulse {pulse ? 'on' : 'off'}
      </button>
    </div>
  );
}
