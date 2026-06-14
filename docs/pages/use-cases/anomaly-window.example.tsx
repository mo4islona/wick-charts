import { useMemo, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  Marker,
  ReferenceLine,
  TimeAxis,
  TimeRegion,
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

const BASELINE = 40;
const ALERT = 70;

// A calm baseline that spikes into an anomaly window, then recovers. Reused from
// the event-markers demo so the two pages tell the same incident story.
function buildMetric(): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = [];

  for (let i = 0; i < COUNT; i++) {
    const time = START + i * INTERVAL;
    let value = BASELINE + Math.sin(i / 3) * 2;

    if (i >= BROKE_I && i < RECOVERED_I) {
      const t = (i - BROKE_I) / (RECOVERED_I - BROKE_I);
      value += Math.sin(t * Math.PI) * 55;
    }

    out.push({ time, value: Math.round(value * 10) / 10 });
  }

  return out;
}

export function AnomalyWindowDemo({ theme }: { theme: ChartTheme }) {
  const metric = useMemo(buildMetric, []);
  const [firing, setFiring] = useState(false);

  const timeAt = (i: number) => metric[i].time;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Controls theme={theme} firing={firing} onFiring={setFiring} />

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartContainer theme={theme} style={{ width: '100%', height: '100%' }}>
          <LineSeries
            id="metric"
            data={{ label: 'requests/s', data: metric }}
            options={{ area: { visible: true }, strokeWidth: 1.5, pulse: false }}
          />

          {/* The incident window. Open-ended (`to="now"`) while firing — it
              extends to the right edge; closed at the recovery time once over. */}
          <TimeRegion
            from={timeAt(BROKE_I)}
            to={firing ? 'now' : timeAt(RECOVERED_I)}
            fill={hexToRgba('#f0556a', 0.1)}
            color="#f0556a"
            label="incident"
          />

          {/* Horizontal reference lines: a calm baseline and an alert threshold. */}
          <ReferenceLine value={BASELINE} label="baseline" />
          <ReferenceLine value={ALERT} label={`alert ${ALERT}`} color="#f0a83c" />

          {/* Vertical reference line: the deploy that preceded the spike. */}
          <ReferenceLine time={timeAt(DEPLOY_I)} label="deploy v2.1.0" color="#6f9ef8" />

          {/* Markers pin the exact moments, snapped to the metric line. */}
          <Marker
            time={timeAt(BROKE_I)}
            seriesId="metric"
            shape="arrow-down"
            pulse={firing}
            label="broke"
            color="#f0556a"
          />
          {!firing && (
            <Marker time={timeAt(RECOVERED_I)} seriesId="metric" shape="dot" label="recovered" color="#46b78f" />
          )}

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
  firing: boolean;
  onFiring: (next: boolean) => void;
}

function Controls({ theme, firing, onFiring }: ControlsProps) {
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
      <span>Incident state:</span>

      <div style={{ display: 'inline-flex', border: `1px solid ${border}`, borderRadius: 6, overflow: 'hidden' }}>
        {[
          { key: true, label: 'still firing' },
          { key: false, label: 'recovered' },
        ].map(({ key, label }) => {
          const active = key === firing;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onFiring(key)}
              style={{
                padding: '5px 12px',
                border: 'none',
                background: active ? hexToRgba('#f0556a', 0.12) : 'transparent',
                color: active && firing ? '#f0556a' : active ? theme.tooltip.textColor : muted,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: active ? 500 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <span style={{ color: muted }}>
        {firing ? 'open-ended band → right edge, pulsing marker' : 'band closes at recovery'}
      </span>
    </div>
  );
}
