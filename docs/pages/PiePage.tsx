import {
  ChartContainer,
  type ChartTheme,
  PieLegend,
  type PieLegendPosition,
  PieSeries,
  type PieSliceData,
  PieTooltip,
  Title,
  perfHud,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

type PieLabelMode = 'outside' | 'inside' | 'none';
type PieLabelContent = 'percent' | 'label' | 'both';
type PieLegendMode = 'value' | 'percent' | 'both';

interface PieSettings {
  donut: boolean;
  tooltipVisible: boolean;
  legendVisible: boolean;
  animate: boolean;
  shadow: boolean;
  shadowAlpha: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  innerShadow: boolean;
  innerShadowAlpha: number;
  innerShadowDepthPct: number;
  innerRatioPct: number;
  padAngle: number;
  cornerRadius: number;
  labelMode: PieLabelMode;
  labelContent: PieLabelContent;
  labelFontSize: number;
  labelGap: number;
  labelDistance: number;
  labelRailWidth: number;
  minSliceAngle: number;
  groupOther: boolean;
  otherMaxSlices: number;
  cardinality: number;
  legendPosition: PieLegendPosition;
  legendMode: PieLegendMode;
}

const PORTFOLIO: PieSliceData[] = [
  { label: 'BTC', value: 42 },
  { label: 'ETH', value: 28 },
  { label: 'SOL', value: 12 },
  { label: 'AVAX', value: 8 },
  { label: 'DOT', value: 6 },
  { label: 'Other', value: 4 },
];

const REVENUE: PieSliceData[] = [
  { label: 'Subscriptions', value: 55 },
  { label: 'Trading fees', value: 25 },
  { label: 'Staking', value: 12 },
  { label: 'Other', value: 8 },
];

const CHAINS: PieSliceData[] = [
  { label: 'Ethereum', value: 58 },
  { label: 'Solana', value: 18 },
  { label: 'BSC', value: 10 },
  { label: 'Avalanche', value: 7 },
  { label: 'Polygon', value: 5 },
  { label: 'Other', value: 2 },
];

// Synthetic "Stress" dataset driven by the cardinality slider. Values decay
// exponentially so the top slice dominates and the tail produces many small
// slices — the pattern that most visibly stresses outside-label layout.
function synthStress(n: number): PieSliceData[] {
  const data: PieSliceData[] = [];
  for (let i = 0; i < n; i++) {
    data.push({ label: `S${i + 1}`, value: 100 * 0.8 ** i });
  }

  return data;
}

type PieState = PlaygroundChartProps & PieSettings;

interface PieCard {
  id: string;
  title: string;
  data: (s: PieSettings) => PieSliceData[];
}

const CARDS: PieCard[] = [
  { id: 'portfolio', title: 'Portfolio', data: () => PORTFOLIO },
  { id: 'revenue', title: 'Revenue', data: () => REVENUE },
  { id: 'chains', title: 'Chains', data: () => CHAINS },
  { id: 'stress', title: 'Stress', data: (s) => synthStress(s.cardinality) },
];

function pieSub(donut: boolean): string {
  return donut ? 'donut' : 'pie';
}

function PieChart({
  theme,
  gradient,
  data,
  donut,
  tooltipVisible,
  legendVisible,
  animate,
  shadow,
  shadowAlpha,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  innerShadow,
  innerShadowAlpha,
  innerShadowDepthPct,
  innerRatioPct,
  padAngle,
  cornerRadius,
  labelMode,
  labelContent,
  labelFontSize,
  labelGap,
  labelDistance,
  labelRailWidth,
  minSliceAngle,
  groupOther,
  otherMaxSlices,
  legendPosition,
  legendMode,
  perfHudVisible,
  title,
}: PlaygroundChartProps & PieSettings & { data: PieSliceData[]; title: string }) {
  const sid = 'pie';

  return (
    <ChartContainer
      theme={theme}
      axis={{ y: { visible: false, width: 0 }, x: { visible: false, height: 0 } }}
      gradient={gradient}
      grid={{ visible: false }}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={pieSub(donut)}>{title}</Title>
      <PieSeries
        id={sid}
        data={data}
        options={{
          innerRadiusRatio: donut ? innerRatioPct / 100 : 0,
          padAngle,
          cornerRadius,
          animate,
          shadow: shadow
            ? {
                color: `rgba(0, 0, 0, ${shadowAlpha})`,
                blur: shadowBlur,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY,
              }
            : false,
          innerShadow: innerShadow
            ? { color: `rgba(0, 0, 0, ${innerShadowAlpha})`, depth: innerShadowDepthPct / 100 }
            : false,
          sliceLabels: {
            mode: labelMode,
            content: labelContent,
            fontSize: labelFontSize,
            labelGap,
            distance: labelDistance,
            railWidth: labelRailWidth,
            minSliceAngle,
          },
          other: groupOther ? { maxSlices: otherMaxSlices } : false,
        }}
      />
      {tooltipVisible && <PieTooltip seriesId={sid} />}
      {legendVisible && <PieLegend seriesId={sid} position={legendPosition} mode={legendMode} />}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-pie',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    {
      key: 'donut',
      label: 'Donut',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'animate',
      label: 'Animate',
      hint: 'Draw-in and hover explode',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const SHADOW_SECTION: SectionSpec = {
  id: 'shadow-pie',
  title: 'Shadow',
  icon: ICONS.display,
  rows: [
    {
      key: 'shadow',
      label: 'Drop shadow',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'shadowAlpha',
      label: 'Drop opacity',
      visible: (s) => s.shadow === true,
      render: (v, onChange) => (
        <Slider value={v as number} min={0.05} max={0.6} step={0.05} onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'shadowBlur',
      label: 'Drop blur',
      visible: (s) => s.shadow === true,
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={60} step={2} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'shadowOffsetX',
      label: 'Drop offset X',
      visible: (s) => s.shadow === true,
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={-20}
          max={20}
          step={1}
          suffix="px"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'shadowOffsetY',
      label: 'Drop offset Y',
      visible: (s) => s.shadow === true,
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={-20}
          max={40}
          step={1}
          suffix="px"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'innerShadow',
      label: 'Inner shadow',
      hint: 'Darker slice rims',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'innerShadowAlpha',
      label: 'Inner opacity',
      visible: (s) => s.innerShadow === true,
      render: (v, onChange) => (
        <Slider value={v as number} min={0.05} max={0.7} step={0.05} onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'innerShadowDepthPct',
      label: 'Inner depth',
      hint: 'How far the rim reaches',
      visible: (s) => s.innerShadow === true,
      render: (v, onChange) => (
        <Slider value={v as number} min={5} max={60} step={5} suffix="%" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const LABEL_MODE_OPTIONS = [
  { value: 'outside' as const, label: 'Outside' },
  { value: 'inside' as const, label: 'Inside' },
  { value: 'none' as const, label: 'None' },
];

const LABEL_CONTENT_OPTIONS = [
  { value: 'both' as const, label: 'Both' },
  { value: 'percent' as const, label: '%' },
  { value: 'label' as const, label: 'Name' },
];

const LEGEND_POSITION_OPTIONS = [
  { value: 'bottom' as const, label: 'Bottom' },
  { value: 'right' as const, label: 'Right' },
];

const LEGEND_MODE_OPTIONS = [
  { value: 'both' as const, label: 'Both' },
  { value: 'value' as const, label: 'Value' },
  { value: 'percent' as const, label: '%' },
];

const GEOMETRY_SECTION: SectionSpec = {
  id: 'geometry-pie',
  title: 'Geometry',
  icon: ICONS.display,
  rows: [
    {
      key: 'innerRatioPct',
      label: 'Donut hole',
      visible: (s) => s.donut === true,
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={85} step={5} suffix="%" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'padAngle',
      label: 'Slice gap',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={8} step={0.5} suffix="°" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'cornerRadius',
      label: 'Corner radius',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={20} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const LABELS_SECTION: SectionSpec = {
  id: 'labels-pie',
  title: 'Labels',
  icon: ICONS.display,
  rows: [
    {
      key: 'labelMode',
      label: 'Mode',
      render: (v, onChange) => (
        <ToggleGroup<PieLabelMode>
          value={v as PieLabelMode}
          options={LABEL_MODE_OPTIONS}
          onChange={onChange as (v: PieLabelMode) => void}
        />
      ),
    },
    {
      key: 'labelContent',
      label: 'Content',
      render: (v, onChange) => (
        <ToggleGroup<PieLabelContent>
          value={v as PieLabelContent}
          options={LABEL_CONTENT_OPTIONS}
          onChange={onChange as (v: PieLabelContent) => void}
        />
      ),
    },
    {
      key: 'labelFontSize',
      label: 'Font size',
      render: (v, onChange) => (
        <Slider value={v as number} min={8} max={18} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'labelGap',
      label: 'Label gap',
      hint: '× font size',
      render: (v, onChange) => (
        <Slider value={v as number} min={0.8} max={3} step={0.1} onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'labelDistance',
      label: 'Distance',
      hint: 'From the pie edge',
      render: (v, onChange) => (
        <Slider value={v as number} min={8} max={60} step={2} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'labelRailWidth',
      label: 'Rail width',
      hint: 'Horizontal tail',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={60} step={2} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'minSliceAngle',
      label: 'Min slice angle',
      hint: 'Narrower slices get no label',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={15} step={0.5} suffix="°" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const GROUPING_SECTION: SectionSpec = {
  id: 'grouping-pie',
  title: 'Grouping',
  icon: ICONS.display,
  rows: [
    {
      key: 'groupOther',
      label: 'Group into "Other"',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'otherMaxSlices',
      label: 'Max slices',
      hint: 'Including "Other"',
      visible: (s) => s.groupOther === true,
      render: (v, onChange) => (
        <Slider value={v as number} min={3} max={15} step={1} onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const STRESS_SECTION: SectionSpec = {
  id: 'stress-pie',
  title: 'Stress',
  // Merge into the built-in Demo section — the cardinality slider changes
  // what the live preview shows (one cell swaps to a synthetic dataset), so
  // it belongs with the other preview-control rows rather than alongside
  // real chart options that'd appear in the copied code snippet.
  extend: 'demo',
  icon: ICONS.display,
  rows: [
    {
      key: 'cardinality',
      label: 'Slices',
      hint: 'Stress card only',
      render: (v, onChange) => (
        <Slider value={v as number} min={3} max={30} step={1} onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const LEGEND_SECTION: SectionSpec = {
  id: 'legend-pie',
  title: 'Legend',
  icon: ICONS.display,
  rows: [
    {
      key: 'legendVisible',
      label: 'Visible',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'legendPosition',
      label: 'Position',
      visible: (s) => s.legendVisible === true,
      render: (v, onChange) => (
        <ToggleGroup<PieLegendPosition>
          value={v as PieLegendPosition}
          options={LEGEND_POSITION_OPTIONS}
          onChange={onChange as (v: PieLegendPosition) => void}
        />
      ),
    },
    {
      key: 'legendMode',
      label: 'Content',
      visible: (s) => s.legendVisible === true,
      render: (v, onChange) => (
        <ToggleGroup<PieLegendMode>
          value={v as PieLegendMode}
          options={LEGEND_MODE_OPTIONS}
          onChange={onChange as (v: PieLegendMode) => void}
        />
      ),
    },
  ] as RowSpec[],
};

// The library's own defaults: the Code tab prints an option only when it differs.
const PAD_ANGLE_DEFAULT = 1.15;
const CORNER_RADIUS_DEFAULT = 3;
const MAX_SLICES_DEFAULT = 8;
const LABEL_DEFAULTS = {
  mode: 'outside',
  content: 'both',
  fontSize: 11,
  labelGap: 1.8,
  distance: 14,
  railWidth: 16,
  minSliceAngle: 2.5,
};

function sliceLabelsCode(s: PieSettings): Record<string, PropValue> {
  const shown: Record<keyof typeof LABEL_DEFAULTS, PropValue> = {
    mode: s.labelMode,
    content: s.labelContent,
    fontSize: s.labelFontSize,
    labelGap: s.labelGap,
    distance: s.labelDistance,
    railWidth: s.labelRailWidth,
    minSliceAngle: s.minSliceAngle,
  };

  const out: Record<string, PropValue> = {};
  for (const key of Object.keys(shown) as (keyof typeof LABEL_DEFAULTS)[]) {
    if (shown[key] !== LABEL_DEFAULTS[key]) out[key] = shown[key];
  }

  return out;
}

function pieOptionsCode(s: PieSettings): Record<string, PropValue> {
  const options: Record<string, PropValue> = {};
  if (s.donut) options.innerRadiusRatio = s.innerRatioPct / 100;
  if (s.padAngle !== PAD_ANGLE_DEFAULT) options.padAngle = s.padAngle;
  if (s.cornerRadius !== CORNER_RADIUS_DEFAULT) options.cornerRadius = s.cornerRadius;
  if (s.animate) options.animate = true;
  if (s.shadow) {
    options.shadow = {
      color: `rgba(0, 0, 0, ${s.shadowAlpha})`,
      blur: s.shadowBlur,
      offsetX: s.shadowOffsetX,
      offsetY: s.shadowOffsetY,
    };
  }
  if (s.innerShadow) {
    options.innerShadow = { color: `rgba(0, 0, 0, ${s.innerShadowAlpha})`, depth: s.innerShadowDepthPct / 100 };
  }

  const labels = sliceLabelsCode(s);
  if (Object.keys(labels).length > 0) options.sliceLabels = labels;

  if (!s.groupOther) options.other = false;
  else if (s.otherMaxSlices !== MAX_SLICES_DEFAULT) options.other = { maxSlices: s.otherMaxSlices };

  return options;
}

function pieCode(s: PieState, card: PieCard): ChartCodeConfig {
  const options = pieOptionsCode(s);
  const legendProps: Record<string, PropValue> = {};
  if (s.legendPosition !== 'bottom') legendProps.position = s.legendPosition;
  if (s.legendMode !== 'both') legendProps.mode = s.legendMode;

  return {
    title: { text: card.title, sub: pieSub(s.donut) },
    theme: 'catppuccin.theme',
    containerProps: s.gradient ? { gradient: true } : undefined,
    components: [
      { component: 'PieSeries', props: { data: 'data', ...(Object.keys(options).length > 0 ? { options } : {}) } },
      // PieTooltip and PieLegend find the only pie series without a `seriesId`.
      ...(s.tooltipVisible ? [{ component: 'PieTooltip' }] : []),
      ...(s.legendVisible ? [{ component: 'PieLegend', props: legendProps }] : []),
    ],
  };
}

export function PiePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<PieSettings>
      id="pie"
      theme={theme}
      extraDefaults={{
        donut: true,
        tooltipVisible: false,
        legendVisible: false,
        animate: false,
        shadow: false,
        shadowAlpha: 0.22,
        shadowBlur: 24,
        shadowOffsetX: 0,
        shadowOffsetY: 10,
        innerShadow: false,
        innerShadowAlpha: 0.1,
        innerShadowDepthPct: 30,
        innerRatioPct: 55,
        padAngle: 1.7,
        cornerRadius: 3,
        labelMode: 'outside',
        labelContent: 'both',
        labelFontSize: 11,
        labelGap: 1.8,
        labelDistance: 14,
        labelRailWidth: 16,
        minSliceAngle: 2.5,
        groupOther: true,
        otherMaxSlices: 8,
        cardinality: 12,
        legendPosition: 'bottom',
        legendMode: 'both',
      }}
      gridTemplate="1fr 1fr"
      gridColumns="1fr 1fr"
      mobileRowHeight={420}
      hideCartesian
      // Pie's only animation control is the `animate` toggle (Display) — the
      // per-kind entry/update sliders are no-op in core and the live chart
      // doesn't pass `animations`, so suppress the built-in Animations section.
      animationKinds={[]}
      sections={[
        DISPLAY_EXTRA,
        GEOMETRY_SECTION,
        SHADOW_SECTION,
        LABELS_SECTION,
        GROUPING_SECTION,
        STRESS_SECTION,
        LEGEND_SECTION,
      ]}
      charts={(props) =>
        CARDS.map((card) => (
          <Cell key={card.id} theme={props.theme} cardId={card.id}>
            <PieChart
              key={`${card.id}-${props.perfHudVisible}`}
              {...props}
              data={card.data(props)}
              title={card.title}
            />
          </Cell>
        ))
      }
      cards={(s): PlaygroundCard[] =>
        CARDS.map((card) => ({ id: card.id, title: card.title, sub: pieSub(s.donut), code: pieCode(s, card) }))
      }
    />
  );
}
