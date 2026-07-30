import { useMemo } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  Marker,
  type MarkerShape,
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
const CANARY_FROM_I = 18;
const CANARY_TO_I = 27;
const WINDOW_FROM_I = 30;
const PEAK_I = 37;
const WINDOW_TO_I = 45;

const BASELINE = 40;
const LIMIT = 70;
const PEAK_RISE = 55; // peak ≈ BASELINE + PEAK_RISE
const CANARY_RISE = 9; // first tremor — stays well under LIMIT

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// Deterministic value-noise: a few incommensurate sines summed into an organic
// wobble, seeded only by the sample index. No Math.random, so the series is
// byte-identical at prerender and after hydration.
function texture(i: number): number {
  return Math.sin(i * 0.7) * 1.5 + Math.sin(i * 1.9 + 0.6) * 0.85 + Math.sin(i * 4.3 + 1.2) * 0.4;
}

// First tremor right after the deploy — a single rounded bump that stays under
// the limit, so the deploy marker gets a visible consequence without reading as
// a second outage.
function canary(i: number): number {
  if (i < CANARY_FROM_I || i > CANARY_TO_I) return 0;

  const t = (i - CANARY_FROM_I) / (CANARY_TO_I - CANARY_FROM_I);

  return Math.sin(t * Math.PI) * CANARY_RISE;
}

// The anomaly itself as a 0..1 envelope: a fast attack into the peak, a gentler
// recovery. Asymmetric on purpose — a symmetric sine bump reads as a math
// function, not an outage.
function incidentEnvelope(i: number): number {
  if (i < WINDOW_FROM_I || i > WINDOW_TO_I) return 0;

  if (i <= PEAK_I) {
    const attack = (i - WINDOW_FROM_I) / (PEAK_I - WINDOW_FROM_I);

    return easeOutCubic(attack);
  }

  const recovery = (i - PEAK_I) / (WINDOW_TO_I - PEAK_I);

  return 1 - easeInOutCubic(recovery);
}

// A calm series that twitches after a deploy, erupts into an anomaly window,
// then settles — a shape worth annotating: pin the moments, shade the window,
// draw the levels.
function buildMetric(): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = [];

  for (let i = 0; i < COUNT; i++) {
    const time = START + i * INTERVAL;
    const env = incidentEnvelope(i);

    // The baseline runs a touch twitchier between the deploy and the window
    // close — the unrest reads as set off by the deploy. Texture is damped to
    // nothing at the apex (1 - env) so the spike still peaks cleanly on PEAK_I.
    const unrest = i >= DEPLOY_I && i <= WINDOW_TO_I ? 1.4 : 1;
    const wobble = texture(i) * unrest * (1 - env);
    const value = BASELINE + wobble + canary(i) + env * PEAK_RISE;

    out.push({ time, value: Math.round(value * 10) / 10 });
  }

  return out;
}

export interface AnnotationsDemoProps {
  theme: ChartTheme;
  /** Shape of the "peak" marker glyph. */
  shape: MarkerShape;
  /** Open-ended window (`to="now"`) + pulsing marker while the incident runs. */
  ongoing: boolean;
  /** Callout chips on markers vs bare glyphs. */
  labeled: boolean;
}

export function AnnotationsDemo({ theme, shape, ongoing, labeled }: AnnotationsDemoProps) {
  const metric = useMemo(buildMetric, []);

  const timeAt = (i: number) => metric[i].time;

  return (
    <div style={{ height: '100%', minHeight: 0, padding: 12, boxSizing: 'border-box' }}>
      <ChartContainer theme={theme} style={{ width: '100%', height: '100%' }}>
        <LineSeries
          id="metric"
          data={{ label: 'requests/s', data: metric }}
          options={{
            area: { visible: true },
            strokeWidth: 2.5,
            curve: 'smooth',
            pulse: false,
            // Calm blue below the limit, hot red above it — the breach reads in
            // the line itself, not just the window band. `below` defaults to the
            // series color, so it tracks the theme.
            threshold: { value: LIMIT, above: '#f0556a' },
          }}
        />

        {/* Region — shade the window. Open-ended (`to="now"`) while ongoing:
              it extends to the right edge; closed at a timestamp once settled. */}
        <TimeRegion
          from={timeAt(WINDOW_FROM_I)}
          to={ongoing ? 'now' : timeAt(WINDOW_TO_I)}
          fill={hexToRgba('#f0556a', 0.12)}
          color="#f0556a"
          label="window"
        />

        {/* Reference lines — horizontal baseline + limit, vertical event. The
              deploy line is violet, not blue, so it never reads as the data line. */}
        <ReferenceLine value={BASELINE} label="baseline" />
        <ReferenceLine value={LIMIT} label={`limit ${LIMIT}`} color="#f0a83c" />
        <ReferenceLine time={timeAt(DEPLOY_I)} label="deploy v2.1.0" color="#cba6f7" />

        {/* Markers — pin the moments, snapped to the metric line. With a
              label the marker renders as a callout chip (the tail replaces an
              arrow glyph); bare markers show the raw glyph. */}
        <Marker
          time={timeAt(PEAK_I)}
          seriesId="metric"
          shape={shape}
          pulse={ongoing}
          label={labeled ? 'peak' : undefined}
          color="#f0556a"
        />
        {!ongoing && (
          <Marker
            time={timeAt(WINDOW_TO_I)}
            seriesId="metric"
            shape="dot"
            label={labeled ? 'settled' : undefined}
            color="#46b78f"
          />
        )}

        <Tooltip />
        <Crosshair />
        <YAxis />
        <TimeAxis />
      </ChartContainer>
    </div>
  );
}
