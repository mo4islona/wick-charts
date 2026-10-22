import { useEffect, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  type SankeyLink,
  type SankeyNode,
  SankeySeries,
  type SankeySeriesOptions,
  SankeyTooltip,
  Title,
  perfHud,
  resolveAxisTextColor,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { PropValue } from '../components/CodePreview';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundChartProps } from '../components/playground/Playground';
import { Select, Slider, Toggle } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

type Palette = 'theme' | 'accent';
type LabelFormat = 'default' | 'full';
type LabelColor = 'theme' | 'muted';

interface SankeySettings {
  tooltipVisible: boolean;
  labels: boolean;
  labelBackdrop: boolean;
  labelFormat: LabelFormat;
  labelColor: LabelColor;
  palette: Palette;
  nodeWidth: number;
  nodePadding: number;
  linkOpacity: number;
  entryMs: number;
  updateMs: number;
  /** Live ticks per second. */
  rate: number;
  /** Largest change of a live flow per tick, in percent. */
  driftPct: number;
}

/** The library's own defaults — the Code tab shows an option only when it differs. */
const DEFAULTS = {
  nodeWidth: 12,
  nodePadding: 12,
  linkOpacity: 0.35,
  entryMs: 1400,
  updateMs: 500,
};

const FUNNEL_NODES: SankeyNode[] = [
  { id: 'search', label: 'Search' },
  { id: 'ads', label: 'Paid ads' },
  { id: 'social', label: 'Social' },
  { id: 'email', label: 'Email' },
  { id: 'landing', label: 'Landing page' },
  { id: 'blog', label: 'Blog' },
  { id: 'signup', label: 'Sign-up' },
  { id: 'trial', label: 'Trial' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'abandoned', label: 'Abandoned' },
  { id: 'paid', label: 'Paid' },
  { id: 'churned', label: 'Churned' },
];

const FUNNEL_LINKS: SankeyLink[] = [
  { source: 'search', target: 'landing', value: 4200 },
  { source: 'search', target: 'blog', value: 1800 },
  { source: 'ads', target: 'landing', value: 2600 },
  { source: 'social', target: 'blog', value: 1500 },
  { source: 'social', target: 'landing', value: 600 },
  { source: 'email', target: 'landing', value: 900 },
  { source: 'landing', target: 'signup', value: 3100 },
  { source: 'landing', target: 'bounced', value: 5200 },
  { source: 'blog', target: 'signup', value: 900 },
  { source: 'blog', target: 'bounced', value: 2400 },
  { source: 'signup', target: 'trial', value: 2600 },
  { source: 'signup', target: 'abandoned', value: 1400 },
  { source: 'trial', target: 'paid', value: 900 },
  { source: 'trial', target: 'churned', value: 1700 },
];

const TEAMS = ['Search', 'Support', 'Code', 'Data', 'Ops', 'Research', 'Sales'];
const MODELS = ['Opus', 'Sonnet', 'Haiku'];

const LLM_NODES: SankeyNode[] = [{ id: 'Budget' }, ...TEAMS.map((id) => ({ id })), ...MODELS.map((id) => ({ id }))];

/** Monthly spend per team and model, in dollars; Ops and Sales are small, so their labels give way. */
const LLM_SPEND: Record<string, Partial<Record<string, number>>> = {
  Search: { Opus: 3000, Sonnet: 9000, Haiku: 6000 },
  Support: { Sonnet: 8000, Haiku: 18000 },
  Code: { Opus: 22000, Sonnet: 19000 },
  Data: { Sonnet: 4500, Haiku: 5000 },
  Ops: { Haiku: 2400 },
  Research: { Opus: 11000, Sonnet: 3000 },
  Sales: { Sonnet: 1200, Haiku: 600 },
};

function llmLinks(): SankeyLink[] {
  const toTeams: SankeyLink[] = [];
  const toModels: SankeyLink[] = [];

  for (const team of TEAMS) {
    let total = 0;
    for (const model of MODELS) {
      const value = LLM_SPEND[team][model];
      if (value === undefined) continue;

      total += value;
      toModels.push({ source: team, target: model, value });
    }

    toTeams.push({ source: 'Budget', target: team, value: total });
  }

  return [...toTeams, ...toModels];
}

const LLM_LINKS = llmLinks();

const formatCount = (value: number) => Math.round(value).toLocaleString('en-US');

interface Demo {
  id: string;
  title: string;
  sub: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** PRNG seed of the drift. */
  seed: number;
  /** Tooltip value with its unit. */
  format: (value: number) => string;
}

const DEMOS: Demo[] = [
  {
    id: 'funnel',
    title: 'Website acquisition',
    sub: 'visitors by channel → page → outcome · last 30 days',
    nodes: FUNNEL_NODES,
    links: FUNNEL_LINKS,
    seed: 11,
    format: (value) => `${formatCount(value)} visitors`,
  },
  {
    id: 'llm',
    title: 'LLM spend',
    sub: '$ per month · budget → team → model',
    nodes: LLM_NODES,
    links: LLM_LINKS,
    seed: 37,
    format: (value) => `$${formatCount(value)} / mo`,
  },
];

// Deterministic PRNG (mulberry32) so the prerendered and the hydrated first
// frame paint the same values.
function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One step of up to `pct` percent, pulled back toward `base` so a long run stays near it; always above 0. */
function driftValue(args: { value: number; base: number; pct: number; rand: () => number }): number {
  const { value, base, pct, rand } = args;
  const noise = ((rand() * 2 - 1) * pct) / 100;
  const next = value + (base - value) * 0.2 + base * noise;

  return Math.max(1, Math.round(next));
}

/** `base` with every value drifting `rate` times a second; the graph's shape stays fixed. */
function useDriftingLinks(args: { base: SankeyLink[]; seed: number; rate: number; driftPct: number }): SankeyLink[] {
  const { base, seed, rate, driftPct } = args;
  const [rand] = useState(() => mulberry32(seed));
  const [links, setLinks] = useState(base);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      setLinks((previous) =>
        previous.map((link, i) => ({
          ...link,
          value: driftValue({ value: link.value, base: base[i].value, pct: driftPct, rand }),
        })),
      );
    }, 1000 / rate);

    return () => window.clearInterval(timer);
  }, [base, rand, rate, driftPct]);

  return links;
}

function seriesOptions(s: SankeySettings, theme: ChartTheme): Partial<SankeySeriesOptions> {
  const labels = s.labels
    ? {
        background: s.labelBackdrop ? undefined : 'transparent',
        format: s.labelFormat === 'full' ? formatCount : undefined,
        color: s.labelColor === 'muted' ? resolveAxisTextColor(theme) : undefined,
      }
    : false;

  return {
    colors: s.palette === 'accent' ? new Array<string>(16).fill(theme.line.color) : undefined,
    nodeWidth: s.nodeWidth,
    nodePadding: s.nodePadding,
    linkOpacity: s.linkOpacity,
    labels,
    entryMs: s.entryMs,
    updateMs: s.updateMs,
  };
}

function SankeyChart(props: PlaygroundChartProps & SankeySettings & { demo: Demo }) {
  const { theme, gradient, perfHudVisible, demo, rate, driftPct, tooltipVisible } = props;
  const links = useDriftingLinks({ base: demo.links, seed: demo.seed, rate, driftPct });

  return (
    <ChartContainer
      theme={theme}
      gradient={gradient}
      grid={{ visible: false }}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={demo.sub}>{demo.title}</Title>
      <SankeySeries nodes={demo.nodes} links={links} options={seriesOptions(props, theme)} />
      {tooltipVisible && <SankeyTooltip format={demo.format} />}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-sankey',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      hint: 'The hovered node or link, its value and its share of the outflow.',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'labels',
      label: 'Labels',
      hint: '`label · value` beside each node. A label that would overlap the one above it is skipped.',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'labelBackdrop',
      label: 'Label backdrop',
      hint: 'A rounded backdrop from the theme background keeps a label readable over the bands.',
      visible: (s) => s.labels === true,
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'labelFormat',
      label: 'Value format',
      hint: 'Formatter for the label values (`labels.format`).',
      visible: (s) => s.labels === true,
      render: (v, onChange) => (
        <Select<LabelFormat>
          value={v as LabelFormat}
          options={[
            { value: 'default', label: 'Plain / compact (default)' },
            { value: 'full', label: 'Full number' },
          ]}
          onChange={onChange as (v: LabelFormat) => void}
        />
      ),
    },
    {
      key: 'labelColor',
      label: 'Label color',
      hint: 'Label text color (`labels.color`): the theme text, or the muted axis text.',
      visible: (s) => s.labels === true,
      render: (v, onChange) => (
        <Select<LabelColor>
          value={v as LabelColor}
          options={[
            { value: 'theme', label: 'Theme text (default)' },
            { value: 'muted', label: 'Muted' },
          ]}
          onChange={onChange as (v: LabelColor) => void}
        />
      ),
    },
  ] as RowSpec[],
};

const SERIES_SECTION: SectionSpec = {
  id: 'series-sankey',
  title: 'Series',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    {
      key: 'palette',
      label: 'Node colors',
      hint: 'Theme palette in node order, or one accent color for every node (`colors`).',
      render: (v, onChange) => (
        <Select<Palette>
          value={v as Palette}
          options={[
            { value: 'theme', label: 'Theme palette' },
            { value: 'accent', label: 'Accent' },
          ]}
          onChange={onChange as (v: Palette) => void}
        />
      ),
    },
    {
      key: 'nodeWidth',
      label: 'Node width',
      hint: 'Width of each node bar.',
      render: (v, onChange) => (
        <Slider value={v as number} min={4} max={24} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'nodePadding',
      label: 'Node gap',
      hint: 'Vertical gap between the nodes of a column.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={32} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'linkOpacity',
      label: 'Link opacity',
      hint: 'Opacity of the bands; a hover dims the bands it leaves out.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0.1} max={0.8} step={0.05} onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const MOTION_SECTION: SectionSpec = {
  id: 'motion-sankey',
  title: 'Animation',
  icon: ICONS.display,
  rows: [
    {
      key: 'entryMs',
      label: 'Entrance',
      hint: 'First-data cascade: sources grow, bands run to their targets and fill them, labels fade in. 0 paints at once.',
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={0}
          max={3000}
          step={50}
          suffix="ms"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'updateMs',
      label: 'Morph',
      hint: 'Ease from the diagram on screen to new data, and the hover dim. 0 snaps.',
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={0}
          max={1500}
          step={50}
          suffix="ms"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
  ] as RowSpec[],
};

// The simulated drift — demo controls, not chart options.
const DEMO_EXTRA: SectionSpec = {
  id: 'demo-sankey',
  title: 'Demo',
  extend: 'demo',
  rows: [
    {
      key: 'rate',
      label: 'Updates',
      hint: 'New values per second in every demo. Each morph starts from the shape on screen, so fast updates glide.',
      render: (v, onChange) => (
        <Slider value={v as number} min={1} max={10} step={1} suffix="/s" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'driftPct',
      label: 'Drift',
      hint: 'Largest change of a live flow per update.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={20} step={1} suffix="%" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const SECTIONS = [DEMO_EXTRA, DISPLAY_EXTRA, SERIES_SECTION, MOTION_SECTION];

/** The options the Code tab prints: only what differs from the library defaults. */
function codeOptions(s: SankeySettings): Record<string, PropValue> {
  const options: Record<string, PropValue> = {};
  if (s.palette === 'accent') options.colors = 'accentColors';
  if (s.nodeWidth !== DEFAULTS.nodeWidth) options.nodeWidth = s.nodeWidth;
  if (s.nodePadding !== DEFAULTS.nodePadding) options.nodePadding = s.nodePadding;
  if (s.linkOpacity !== DEFAULTS.linkOpacity) options.linkOpacity = s.linkOpacity;

  if (!s.labels) {
    options.labels = false;
  } else {
    const labels: Record<string, PropValue> = {};
    if (!s.labelBackdrop) labels.background = 'transparent';
    if (s.labelFormat === 'full') labels.format = 'formatCount';
    if (s.labelColor === 'muted') labels.color = 'catppuccin.theme.axis.textColor';
    if (Object.keys(labels).length > 0) options.labels = labels;
  }

  if (s.entryMs !== DEFAULTS.entryMs) options.entryMs = s.entryMs;
  if (s.updateMs !== DEFAULTS.updateMs) options.updateMs = s.updateMs;

  return options;
}

export function SankeyPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<SankeySettings>
      id="sankey"
      theme={theme}
      extraDefaults={{
        tooltipVisible: true,
        labels: true,
        labelBackdrop: true,
        labelFormat: 'default',
        labelColor: 'theme',
        palette: 'theme',
        nodeWidth: DEFAULTS.nodeWidth,
        nodePadding: DEFAULTS.nodePadding,
        linkOpacity: DEFAULTS.linkOpacity,
        entryMs: DEFAULTS.entryMs,
        updateMs: DEFAULTS.updateMs,
        rate: 3,
        driftPct: 4,
      }}
      gridTemplate="repeat(2, minmax(560px, 1fr))"
      gridColumns="1fr"
      mobileRowHeight={420}
      hideCartesian
      // Sankey motion is driven by the per-series entryMs / updateMs rows in
      // the Animation section below — suppress the built-in per-kind sliders.
      animationKinds={[]}
      sections={SECTIONS}
      charts={(props) =>
        DEMOS.map((demo) => (
          <Cell key={demo.id} theme={props.theme}>
            <SankeyChart key={`${demo.id}-${props.perfHudVisible}-${props.entryMs}`} {...props} demo={demo} />
          </Cell>
        ))
      }
      codeConfig={(s) => {
        const containerProps: Record<string, PropValue> = { grid: { visible: false } };
        if (s.gradient) containerProps.gradient = true;
        if (s.perfHudVisible) containerProps.perf = 'perfHud()';

        return {
          theme: 'catppuccin.theme',
          containerProps,
          components: [
            { component: 'SankeySeries', props: { nodes: 'nodes', links: 'links', options: codeOptions(s) } },
            ...(s.tooltipVisible ? [{ component: 'SankeyTooltip', props: {} }] : []),
          ],
        };
      }}
    />
  );
}
