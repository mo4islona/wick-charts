import { FLAVORS, installAllCommand, installCommand } from '../../demos/shadcn/catalog';
import { FrameworkLink, type GuideCopy, HEADINGS, registriesJson } from './shadcn-guide';

const THEME_HOOK_CODE = `const ref = useRef<HTMLDivElement>(null);
const theme = useWickTheme(ref);

return (
  <div ref={ref} className="h-64">
    <ChartContainer theme={theme}>…</ChartContainer>
  </div>
);`;

const WRAPPER_CODE = `import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

import { WickChart } from '@/components/ui/wick-chart';

export function Revenue({ data }: { data: TimePoint[] }) {
  return (
    <WickChart className="aspect-auto h-[250px]">
      <LineSeries data={data} />
      <YAxis />
      <TimeAxis />
      <Tooltip />
    </WickChart>
  );
}`;

/** The shadcn/ui registry for React. */
export const REACT_COPY: GuideCopy = {
  lead: (demoLink) => (
    <p style={{ margin: 0 }}>
      Chart blocks for shadcn/ui. For Vue and Nuxt, see the{' '}
      <FrameworkLink framework="vue">shadcn-vue blocks</FrameworkLink>. {demoLink}
    </p>
  ),
  steps: (block) => [
    {
      heading: HEADINGS.add,
      body: (
        <>
          Install the block, then render <code>&lt;{block.component} /&gt;</code> from{' '}
          <code>@/components/{block.name}</code>.
        </>
      ),
      code: installCommand(block.name),
    },
    {
      heading: HEADINGS.byName,
      body: (
        <>
          Add the registry to <code>components.json</code> to install by name:{' '}
          <code>npx shadcn@latest add @wick-charts/{block.name}</code>. All items:{' '}
          <a href={`${FLAVORS.react.registryUrl}/registry.json`} target="_blank" rel="noopener noreferrer">
            registry.json
          </a>
          .
        </>
      ),
      code: registriesJson('react'),
    },
    {
      heading: HEADINGS.all,
      body: (
        <>
          <code>shadcn add --all</code> reads only the default registry, so name every block in one command.
        </>
      ),
      code: installAllCommand('react'),
    },
    {
      heading: HEADINGS.theme,
      body: (
        <>
          The <code>wick-theme</code> item adds <code>useWickTheme</code> to <code>@/hooks</code>; every block brings
          it. To add it alone: <code>npx shadcn@latest add @wick-charts/wick-theme</code>.{' '}
          <code>useWickTheme(ref?)</code> reads <code>--background</code>, <code>--foreground</code>,{' '}
          <code>--muted-foreground</code>, <code>--border</code> and <code>--chart-1</code> … <code>--chart-5</code>,
          and follows dark mode. Candles and order book sides take your chart colors, not green and red. Pass a ref to
          read the tokens inside a scoped <code>.dark</code> panel.
        </>
      ),
      code: THEME_HOOK_CODE,
    },
    {
      heading: HEADINGS.wrapper,
      body: (
        <>
          The <code>wick-chart</code> item adds <code>WickChart</code> to <code>@/components/ui/wick-chart</code>:{' '}
          <code>npx shadcn@latest add @wick-charts/wick-chart</code>. Size it with classes:{' '}
          <code>aspect-video</code> by default,{' '}
          <code>aspect-auto h-[250px]</code> for a fixed height. It takes every <code>ChartContainer</code> prop and
          draws horizontal grid lines only. <code>theme</code> also takes a function that adjusts the generated theme;
          define it outside the component.
        </>
      ),
      code: WRAPPER_CODE,
    },
  ],
};
