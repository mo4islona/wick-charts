import { type CSSProperties, type ReactNode, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { Segmented } from '../../../components/kit';
import { HighlightedCode } from '../../../components/playground/CodeView';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { hexToRgba } from '../../../utils';
import { LOADER_VARIANTS, type LoaderId, type LoaderVariant } from './variants';

export type DemoSeries = 'candles' | 'line' | 'bars';
export type Latency = '80' | '400' | '1500' | 'hold';

/** The last finished fetch: how long it took, and how long the loader stayed. */
export interface LoadReport {
  fetchMs: number;
  shownMs: number;
}

const SERIES_OPTIONS: Array<{ value: DemoSeries; label: string }> = [
  { value: 'candles', label: 'Candles' },
  { value: 'line', label: 'Line' },
  { value: 'bars', label: 'Bars' },
];

const LATENCY_OPTIONS: Array<{ value: Latency; label: string }> = [
  { value: '80', label: '80 ms' },
  { value: '400', label: '400 ms' },
  { value: '1500', label: '1.5 s' },
  { value: 'hold', label: 'hold' },
];

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
/** Every row's label sits in this column, so the controls start on one vertical line. */
const LABEL_COLUMN = 76;
/** Chips, segmented tracks and the button share one height, so a row's label centers on all of them. */
const CONTROL_HEIGHT = 30;
const TRACK_STYLE: CSSProperties = { height: CONTROL_HEIGHT, boxSizing: 'border-box', justifySelf: 'start' };

export interface LoaderPanelProps {
  theme: ChartTheme;
  loaderId: LoaderId;
  onLoaderChange: (next: LoaderId) => void;
  series: DemoSeries;
  onSeriesChange: (next: DemoSeries) => void;
  latency: Latency;
  onLatencyChange: (next: Latency) => void;
  onJump: () => void;
  loading: boolean;
  lastLoad: LoadReport | null;
}

/**
 * Controls for the data-loading demo on one label column: the real choices
 * (the `indicator` prop and the series), then — under a dashed rule — the
 * simulated fetch, then the props echoed as code.
 */
export function LoaderPanel(props: LoaderPanelProps) {
  const { theme, loaderId, series, latency, loading, lastLoad } = props;
  const text = theme.tooltip.textColor;
  const loader = LOADER_VARIANTS.find((variant) => variant.id === loaderId) ?? LOADER_VARIANTS[0];
  const morphNote = loader.morphs && series === 'candles' ? ' Morphs into the candles.' : '';

  // One line fits the desktop column; a phone needs the props stacked.
  const mobile = useIsMobile();
  const echoedProps = ['onTrigger={loadOlder}', `indicator={${loader.codeName}}`];
  const snippet = mobile ? `<EdgeLoader\n  ${echoedProps.join('\n  ')}\n/>` : `<EdgeLoader ${echoedProps.join(' ')} />`;

  return (
    <section aria-label="Loader demo controls" style={panelStyle(theme)}>
      <Row theme={theme} label="indicator" prop>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <fieldset aria-label="indicator" style={chipGrid}>
            {LOADER_VARIANTS.map((variant) => (
              <VariantChip
                key={variant.id}
                theme={theme}
                variant={variant}
                selected={variant.id === loaderId}
                onSelect={() => props.onLoaderChange(variant.id)}
              />
            ))}
          </fieldset>
          <span style={{ fontSize: 11, lineHeight: 1.4, color: hexToRgba(text, 0.55) }}>
            {loader.note}
            {morphNote}
          </span>
        </div>
      </Row>

      <Row theme={theme} label="series">
        <Segmented<DemoSeries>
          theme={theme}
          value={series}
          onChange={props.onSeriesChange}
          ariaLabel="Series type"
          options={SERIES_OPTIONS}
          style={TRACK_STYLE}
        />
      </Row>

      <DemoRule theme={theme} />

      <Row theme={theme} label="fetch">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Segmented<Latency>
            theme={theme}
            value={latency}
            onChange={props.onLatencyChange}
            ariaLabel="Fetch latency"
            options={LATENCY_OPTIONS}
            style={TRACK_STYLE}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <LoadReportText theme={theme} report={loading ? null : lastLoad} />
            <JumpButton theme={theme} loading={loading} onClick={props.onJump} />
          </div>
        </div>
      </Row>

      <HighlightedCode code={snippet} theme={theme} style={{ '--code-fs': '11px' } as CSSProperties} />
    </section>
  );
}

const chipGrid: CSSProperties = {
  margin: 0,
  padding: 0,
  border: 'none',
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
  gap: 4,
};

function panelStyle(theme: ChartTheme): CSSProperties {
  const text = theme.tooltip.textColor;

  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    padding: 12,
    border: `1px solid ${hexToRgba(text, 0.14)}`,
    borderRadius: 8,
    background: hexToRgba(text, 0.02),
    color: text,
    fontFamily: theme.typography.fontFamily,
  };
}

/** Label column + control. `prop` sets the label in mono, so it reads as the prop it is. */
function Row({
  theme,
  label,
  prop = false,
  children,
}: {
  theme: ChartTheme;
  label: string;
  prop?: boolean;
  children: ReactNode;
}) {
  const text = theme.tooltip.textColor;
  const labelStyle: CSSProperties = prop
    ? { fontFamily: MONO, fontSize: 11, color: hexToRgba(text, 0.85) }
    : { fontSize: 11, color: hexToRgba(text, 0.55) };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COLUMN}px minmax(0, 1fr)`, alignItems: 'start' }}>
      <span style={{ ...labelStyle, lineHeight: `${CONTROL_HEIGHT}px` }}>{label}</span>
      {children}
    </div>
  );
}

/** The dashed rule that sets the simulated fetch apart from the real props. */
function DemoRule({ theme }: { theme: ChartTheme }) {
  const muted = hexToRgba(theme.tooltip.textColor, 0.22);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: hexToRgba(theme.tooltip.textColor, 0.45),
        }}
      >
        demo
      </span>
      <span style={{ flex: 1, borderTop: `1px dashed ${muted}` }} />
    </div>
  );
}

function VariantChip({
  theme,
  variant,
  selected,
  onSelect,
}: {
  theme: ChartTheme;
  variant: LoaderVariant;
  selected: boolean;
  onSelect: () => void;
}) {
  const text = theme.tooltip.textColor;
  const accent = theme.line.color;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        height: CONTROL_HEIGHT,
        padding: '0 8px',
        border: `1px solid ${selected ? hexToRgba(accent, 0.7) : hexToRgba(text, 0.14)}`,
        borderRadius: 6,
        background: selected ? hexToRgba(accent, 0.12) : 'transparent',
        color: selected ? text : hexToRgba(text, 0.75),
        cursor: 'pointer',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize - 1,
        fontWeight: selected ? 600 : 500,
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      {variant.label}
    </button>
  );
}

const NO_REPORT: LoadReport = { fetchMs: 0, shownMs: 0 };

/**
 * Two short lines beside the button. The slot keeps its size while there is
 * nothing to report, so the row never reflows and the chart under it holds still.
 */
function LoadReportText({ theme, report }: { theme: ChartTheme; report: LoadReport | null }) {
  const shown = report ?? NO_REPORT;
  const held = shown.shownMs > shown.fetchMs;
  const muted = hexToRgba(theme.tooltip.textColor, 0.55);
  const line: CSSProperties = { display: 'block', whiteSpace: 'nowrap' };

  return (
    <span
      aria-hidden={report === null}
      title={held ? 'The fetch was faster than minDuration, so the loader was held.' : undefined}
      style={{
        minWidth: '13ch',
        fontFamily: MONO,
        fontSize: 10,
        lineHeight: '14px',
        textAlign: 'right',
        color: muted,
        visibility: report === null ? 'hidden' : 'visible',
      }}
    >
      <span style={line}>fetch {shown.fetchMs} ms</span>
      <span style={{ ...line, color: held ? theme.line.color : muted }}>
        {held ? 'held' : 'shown'} {shown.shownMs} ms
      </span>
    </span>
  );
}

/** Dark or white ink, whichever reads on `background` (hex only; anything else gets white). */
function inkOn(background: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (hex === null) return '#ffffff';

  const value = Number.parseInt(hex[1], 16);
  const luma = 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);

  return luma > 160 ? '#11131a' : '#ffffff';
}

const JUMP_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M1.5 1.5v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path
      d="M12.5 7H4.5M4.5 7l3.2-3.2M4.5 7l3.2 3.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SPINNER_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" />
    <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 7 7"
        to="360 7 7"
        dur="0.8s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
);

/**
 * The demo's call to action — the one filled button in the panel, so it reads
 * first. While a fetch runs it turns into the loading readout: a spinner on a
 * tinted fill, same width, so nothing around it shifts.
 */
function JumpButton({ theme, loading, onClick }: { theme: ChartTheme; loading: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const accent = theme.line.color;
  const lifted = hover && !loading;

  return (
    <button
      type="button"
      aria-label={loading ? 'Loading history' : 'Pan to the history edge'}
      aria-busy={loading}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minWidth: 136,
        height: CONTROL_HEIGHT,
        padding: '0 14px 0 11px',
        border: `1px solid ${loading ? hexToRgba(accent, 0.55) : accent}`,
        borderRadius: 6,
        background: loading ? hexToRgba(accent, 0.14) : accent,
        color: loading ? accent : inkOn(accent),
        boxShadow: lifted ? `0 4px 14px ${hexToRgba(accent, 0.45)}` : 'none',
        transform: lifted ? 'translateY(-1px)' : 'none',
        cursor: loading ? 'progress' : 'pointer',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize - 1,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        transition: 'background 160ms ease, color 160ms ease, box-shadow 140ms ease, transform 140ms ease',
      }}
    >
      {loading ? SPINNER_ICON : JUMP_ICON}
      {loading ? 'Loading…' : 'Jump to edge'}
    </button>
  );
}
