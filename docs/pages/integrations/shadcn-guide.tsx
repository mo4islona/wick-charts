import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { Segmented } from '../../components/kit';
import { useFramework } from '../../context/framework';
import {
  BLOCKS,
  type BlockEntry,
  type DemoMessage,
  FLAVORS,
  type Flavor,
  PALETTES,
  type PaletteName,
  demoUrl,
} from '../../demos/shadcn/catalog';
import { useIsMobile } from '../../hooks/useIsMobile';
import { routeToPath } from '../../router';
import { routeForFramework } from '../../routes';
import { hexToRgba, isDarkColor } from '../../utils';

export const HEADINGS = {
  pick: '01 — PICK A BLOCK',
  add: '02 — ADD IT WITH THE CLI',
  byName: '03 — OR ADD BLOCKS BY NAME',
  theme: '04 — THEMED FROM YOUR CSS VARIABLES',
  wrapper: '05 — SIZE A CHART WITH CLASSES',
  svelte: '06 — SVELTE',
};

const PALETTE_OPTIONS = (Object.keys(PALETTES) as PaletteName[]).map((name) => ({
  value: name,
  label: PALETTES[name].label,
}));

const DEFAULT_BLOCK = BLOCKS.find((entry) => entry.name === 'chart-candlestick') ?? BLOCKS[0];

export function registriesJson(flavor: Flavor): string {
  return `{
  "registries": {
    "@wick-charts": "${FLAVORS[flavor].registryUrl}/{name}.json"
  }
}`;
}

/**
 * A link to the page's view for `framework` that also picks that framework, as the sidebar selector does.
 * The main URL opens the view of the chosen framework, so a plain link would send the reader back.
 */
export function FrameworkLink({ framework, children }: { framework: Flavor; children: ReactNode }) {
  const [, setFramework] = useFramework();

  const pick = (event: MouseEvent<HTMLAnchorElement>) => {
    const newTab = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (newTab) return;

    // The pick re-renders this anchor as the link back before the app's link handler reads its href.
    event.preventDefault();
    setFramework(framework);
  };

  return (
    <a href={routeToPath(routeForFramework('integrations/shadcn', framework))} onClick={pick}>
      {children}
    </a>
  );
}

/** What differs between the React and the Vue registry on the page. */
export interface GuideCopy {
  /** The line above the columns; `demoLink` opens every block in a new window. */
  lead: (demoLink: ReactNode) => ReactNode;
  /** The steps between the block picker and the Svelte note. */
  steps: (block: BlockEntry) => Step[];
}

export interface ShadcnGuideProps {
  theme: ChartTheme;
  flavor: Flavor;
  copy: GuideCopy;
}

/** The shadcn guide: a block picker, the demo of the picked registry in a frame and the install steps. */
export function ShadcnGuide({ theme, flavor, copy }: ShadcnGuideProps) {
  const mobile = useIsMobile();
  const [block, setBlock] = useState(DEFAULT_BLOCK);
  const [palette, setPalette] = useState<PaletteName>('neutral');
  const mode = isDarkColor(theme.background) ? 'dark' : 'light';

  // A framework pick loads the other demo app; later changes go by message, so the frame keeps its live data.
  const [frame, setFrame] = useState(() => ({
    flavor,
    src: demoUrl({ flavor, block: block.name, mode, palette, embed: true }),
  }));
  if (frame.flavor !== flavor) {
    setFrame({ flavor, src: demoUrl({ flavor, block: block.name, mode, palette, embed: true }) });
  }

  const frameRef = useRef<HTMLIFrameElement>(null);
  const syncFrame = useCallback(() => {
    const message: DemoMessage = { type: 'wick-shadcn-demo', block: block.name, mode, palette };
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [block.name, mode, palette]);

  useEffect(() => syncFrame(), [syncFrame]);

  const pickBlock = (next: BlockEntry) => {
    setBlock(next);

    // On a phone the preview sits above the list, out of view.
    if (mobile) frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const pickStep: Step = {
    heading: HEADINGS.pick,
    body: <BlockList theme={theme} value={block} onPick={pickBlock} />,
  };

  const svelteStep: Step = {
    heading: HEADINGS.svelte,
    body: (
      <>
        There is no Svelte registry. Use <code>@wick-charts/svelte</code> and build a theme with{' '}
        <code>createTheme</code>.
      </>
    ),
  };

  const demoLink = (
    <a href={demoUrl({ flavor, mode, palette })} target="_blank" rel="noopener noreferrer">
      All blocks on one page ↗
    </a>
  );

  return (
    <AdvancedLayout
      theme={theme}
      lead={copy.lead(demoLink)}
      chartControls={
        <>
          <span>Chart colors:</span>
          <Segmented<PaletteName>
            theme={theme}
            value={palette}
            onChange={setPalette}
            ariaLabel="Chart colors"
            options={PALETTE_OPTIONS}
          />
        </>
      }
      chart={
        <iframe
          key={frame.flavor}
          ref={frameRef}
          src={frame.src}
          onLoad={syncFrame}
          title={`${block.title} preview`}
          style={{ flex: 1, width: '100%', border: 0, display: 'block', colorScheme: mode }}
        />
      }
      chartHeight="clamp(440px, 70vh, 600px)"
      mobileChartHeight={480}
      steps={[pickStep, ...copy.steps(block), svelteStep]}
    />
  );
}

function BlockList({
  theme,
  value,
  onPick,
}: {
  theme: ChartTheme;
  value: BlockEntry;
  onPick: (next: BlockEntry) => void;
}) {
  const text = theme.tooltip.textColor;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 4,
        marginTop: 12,
      }}
    >
      {BLOCKS.map((entry) => {
        const active = entry.name === value.name;

        return (
          <button
            key={entry.name}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(entry)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '8px 10px',
              border: `1px solid ${active ? hexToRgba(text, 0.28) : 'transparent'}`,
              borderRadius: 6,
              background: active ? hexToRgba(text, 0.08) : 'transparent',
              color: text,
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 500 }}>{entry.title}</span>
            <span style={{ fontSize: theme.typography.fontSize - 1, lineHeight: 1.45, color: hexToRgba(text, 0.62) }}>
              {entry.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
