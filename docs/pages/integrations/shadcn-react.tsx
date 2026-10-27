import { type BlockEntry, installCommand } from '../../demos/shadcn/catalog';
import { type GuideCopy, HEADINGS, YourData } from './shadcn-guide';

function usageCode(block: BlockEntry): string {
  return `import { ${block.component} } from '@/components/${block.name}';

export default function Dashboard() {
  return <${block.component} />;
}`;
}

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
  lead: (demoLink) => <p style={{ margin: 0 }}>Chart blocks for shadcn/ui. {demoLink}</p>,
  steps: (block) => [
    {
      heading: HEADINGS.add,
      code: installCommand(block.name),
    },
    {
      heading: HEADINGS.use,
      body: <YourData block={block} file={`${block.name}.tsx`} />,
      code: usageCode(block),
    },
    {
      heading: HEADINGS.own,
      body: (
        <>
          Add the chart container of the blocks: <code>{installCommand('wick-chart')}</code>. It takes the colors and
          dark mode of your shadcn theme. Set the size with classes, the default is <code>aspect-video</code>.
        </>
      ),
      code: WRAPPER_CODE,
    },
  ],
};
