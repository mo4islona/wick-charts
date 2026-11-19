import type { CSSProperties, ReactNode } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  Legend,
  LineSeries,
  ReferenceLine,
  Title,
  Tooltip,
  XAxis,
  YAxis,
  dracula,
  githubLight,
} from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { isDarkColor } from '../../utils';
import spec from './server-render-spec.json';

const INSTALL_CODE = 'npm install @wick-charts/render';

const RENDER_CODE = `import { writeFile } from 'node:fs/promises';
import { renderChart } from '@wick-charts/render';

// web = { label: 'Web', data: [{ time, value }, …] }
const { data } = await renderChart({
  width: 560,
  height: 280,
  theme: 'dracula',
  title: { text: 'Daily active users', sub: 'Sep – Oct 2026' },
  legend: true,
  series: [{ type: 'line', data: [web, mobile] }],
  lines: [{ value: 10_000, label: 'Goal' }],
});

await writeFile('report.png', data);`;

const CLI_CODE = `npx @wick-charts/render spec.json -o report.png
cat spec.json | npx @wick-charts/render - -o report.svg`;

const MCP_CODE = 'claude mcp add wick-charts -- npx -y @wick-charts/render mcp';

const JSON_CODE = `{
  "yAxis": { "format": "{value}%" },
  "axis": { "y": { "scale": "log" } },
  "series": [
    { "type": "line", "data": [{ "time": "2026-10-01", "value": 42.5 }] }
  ]
}`;

const OPTIONS_CODE = `await renderChart({ ...spec, background: 'transparent' });
await renderChart(spec, { format: 'svg', pixelRatio: 1 });
registerFont({ path: './fonts/Caveat.woff2', family: 'Caveat' });`;

export const SERVER_RENDER_STEPS: Step[] = [
  {
    heading: '01 — INSTALL',
    body: <>Node 20 or later. The canvas ships prebuilt binaries: no system libraries.</>,
    code: INSTALL_CODE,
  },
  {
    heading: '02 — RENDER A CHART',
    body: (
      <>
        The spec is the <code>ChartContainer</code> props, with the children as data:{' '}
        <code>{"{ type: 'line', data }"}</code> is <code>{'<LineSeries data={data} />'}</code>. The same engine draws
        it, so it matches the app chart.
      </>
    ),
    code: RENDER_CODE,
  },
  {
    heading: '03 — COMMAND LINE',
    body: <>The file extension sets the format.</>,
    code: CLI_CODE,
  },
  {
    heading: '04 — MCP SERVER',
    body: (
      <>
        One tool, <code>render_chart</code>. With <code>output</code>, it writes the file. Without it, it returns the
        image.
      </>
    ),
    code: MCP_CODE,
  },
  {
    heading: '05 — A SPEC IN JSON',
    body: (
      <>
        JSON has no dates and no functions: use ISO times, <code>"log"</code> and format templates.
      </>
    ),
    code: JSON_CODE,
  },
  {
    heading: '06 — BACKGROUND, SVG AND FONTS',
    code: OPTIONS_CODE,
  },
  {
    heading: '07 — LIMITS',
    body: (
      <ul>
        <li>A static frame: no tooltip, crosshair or animation.</li>
        <li>
          No <code>YLabel</code>, <code>InfoBar</code> or custom series. Title, legend and axis labels take no render
          functions.
        </li>
        <li>No edge fades in SVG.</li>
      </ul>
    ),
  },
];

/** The spec's ISO dates as the epoch ms that the app components take. */
const LAYERS = spec.series[0].data.map((layer) => ({
  label: layer.label,
  data: layer.data.map((point) => ({ time: Date.parse(point.time), value: point.value })),
}));

const GOAL = spec.lines[0];

function Card({ theme, label, children }: { theme: ChartTheme; label: string; children: ReactNode }) {
  const labelStyle: CSSProperties = {
    fontSize: theme.typography.fontSize - 1,
    color: theme.axis.textColor,
    marginBottom: 6,
  };

  return (
    <div style={{ width: '100%', maxWidth: spec.width }}>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          aspectRatio: `${spec.width} / ${spec.height}`,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${theme.tooltip.borderColor}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The live chart and its server PNG, in one preset: the docs theme picks the dark or the light pair. */
function SameChartDemo({ theme }: { theme: ChartTheme }) {
  const dark = isDarkColor(theme.background);
  const preset = dark ? dracula : githubLight;
  const image = dark ? '/render/report-dark.png' : '/render/report-light.png';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card theme={theme} label="In the app: ChartContainer">
        <ChartContainer theme={preset.theme}>
          <Title sub={spec.title.sub}>{spec.title.text}</Title>
          <LineSeries data={LAYERS} />
          <ReferenceLine value={GOAL.value} label={GOAL.label} />
          <YAxis />
          <XAxis />
          <Legend />
          <Tooltip />
          <Crosshair />
        </ChartContainer>
      </Card>
      <Card theme={theme} label="In the report: renderChart PNG">
        <img
          src={image}
          alt="The same daily active users chart, rendered to PNG in Node"
          width={spec.width}
          height={spec.height}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </Card>
    </div>
  );
}

/** The `@wick-charts/render` package: PNG and SVG in Node, the CLI and the MCP server. */
export function ServerRenderPage({ theme }: { theme: ChartTheme }) {
  const lead = (
    <p style={{ margin: 0 }}>
      The same chart as PNG or SVG in Node, for Slack, pull requests, reports and emails. Also an MCP server for agents.
    </p>
  );

  return (
    <AdvancedLayout
      theme={theme}
      lead={lead}
      chart={<SameChartDemo theme={theme} />}
      framedChart={false}
      chartHeight="auto"
      steps={SERVER_RENDER_STEPS}
    />
  );
}
