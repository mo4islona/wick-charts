import { type ComponentType, type ReactNode, useEffect, useLayoutEffect, useState } from 'react';

import {
  BLOCKS,
  type BlockEntry,
  type Mode,
  PALETTES,
  type PaletteName,
  installCommand,
  isDemoMessage,
  isPaletteName,
} from './catalog';
import { cn } from './lib/utils';

type ModeSetting = Mode | 'system';

// Each block file exports one component, named as in the catalog.
const BLOCK_MODULES = import.meta.glob<Record<string, ComponentType>>('../../../registry/shadcn/blocks/*.tsx', {
  eager: true,
});

const MODE_KEY = 'wick-shadcn-demo-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const GUIDE_PATH = '/integrations/shadcn/';

const MODE_OPTIONS: { value: ModeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const PALETTE_OPTIONS = (Object.keys(PALETTES) as PaletteName[]).map((name) => ({
  value: name,
  label: PALETTES[name].label,
}));

function blockComponent(entry: BlockEntry): ComponentType | undefined {
  const blockModule = BLOCK_MODULES[`../../../registry/shadcn/blocks/${entry.name}.tsx`];

  return blockModule?.[entry.component];
}

function findBlock(name: string | null): BlockEntry | null {
  return BLOCKS.find((entry) => entry.name === name) ?? null;
}

function isModeSetting(value: unknown): value is ModeSetting {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Storage can throw in a private window or a sandboxed frame; the mode then lasts one visit.
function readStoredMode(): ModeSetting | null {
  try {
    const stored = localStorage.getItem(MODE_KEY);

    return isModeSetting(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeMode(mode: ModeSetting): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The choice is a convenience.
  }
}

function useSystemMode(): Mode {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);

    return () => query.removeEventListener('change', onChange);
  }, []);

  return dark ? 'dark' : 'light';
}

/** Puts the mode class and the palette's `--chart-*` values on `<html>`, as a shadcn theme does. */
function applyLook(mode: Mode, palette: PaletteName): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');

  const ramp = PALETTES[palette];
  const values = mode === 'dark' && ramp.dark.length > 0 ? ramp.dark : ramp.light;

  for (let i = 0; i < 5; i++) {
    const token = `--chart-${i + 1}`;
    const value = values[i];

    if (value === undefined) {
      root.style.removeProperty(token);
    } else {
      root.style.setProperty(token, `oklch(${value})`);
    }
  }
}

function replaceQuery(updates: Record<string, string | null>): void {
  const url = new URL(window.location.href);

  for (const [name, value] of Object.entries(updates)) {
    if (value === null) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
  }

  window.history.replaceState(null, '', url);
}

export function App() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const embedded = params.has('embed');

  const [block, setBlock] = useState(() => findBlock(params.get('block')));
  const [palette, setPalette] = useState<PaletteName>(() => {
    const requested = params.get('palette');

    return isPaletteName(requested) ? requested : 'neutral';
  });
  const [modeSetting, setModeSetting] = useState<ModeSetting>(() => {
    const requested = params.get('theme');
    if (isModeSetting(requested)) return requested;

    return (!embedded && readStoredMode()) || 'system';
  });

  const systemMode = useSystemMode();
  const mode = modeSetting === 'system' ? systemMode : modeSetting;

  useLayoutEffect(() => applyLook(mode, palette), [mode, palette]);

  // The docs guide drives an embedded demo by message, so a change does not reload the frame.
  useEffect(() => {
    if (!embedded) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isDemoMessage(event.data)) return;

      setBlock(findBlock(event.data.block));
      setModeSetting(event.data.mode);
      setPalette(event.data.palette);
    };
    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [embedded]);

  if (embedded) {
    return (
      <main className="flex min-h-svh flex-col justify-center p-4">
        {block ? <BlockView entry={block} bare /> : <Gallery />}
      </main>
    );
  }

  const changeBlock = (next: BlockEntry | null) => {
    setBlock(next);
    replaceQuery({ block: next?.name ?? null });
  };

  const changePalette = (next: PaletteName) => {
    setPalette(next);
    replaceQuery({ palette: next === 'neutral' ? null : next });
  };

  const changeMode = (next: ModeSetting) => {
    setModeSetting(next);
    storeMode(next);
    replaceQuery({ theme: null });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-col gap-4 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Wick Charts blocks for shadcn/ui</h1>
            <p className="text-sm text-muted-foreground">
              Each block is a chart in a shadcn card, themed from the CSS variables of this page.
            </p>
          </div>
          <a
            href={GUIDE_PATH}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Install guide →
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented label="Mode" value={modeSetting} options={MODE_OPTIONS} onChange={changeMode} />
          <Segmented label="Chart colors" value={palette} options={PALETTE_OPTIONS} onChange={changePalette} />
        </div>
        <nav aria-label="Blocks" className="flex flex-wrap gap-1">
          <NavButton active={block === null} onClick={() => changeBlock(null)}>
            All blocks
          </NavButton>
          {BLOCKS.map((entry) => (
            <NavButton key={entry.name} active={block?.name === entry.name} onClick={() => changeBlock(entry)}>
              {entry.title}
            </NavButton>
          ))}
        </nav>
      </header>

      {block ? <BlockView entry={block} /> : <Gallery />}
    </div>
  );
}

function Gallery() {
  return (
    <div className="grid gap-x-4 gap-y-8 md:grid-cols-2">
      {BLOCKS.map((entry) => (
        <BlockView key={entry.name} entry={entry} />
      ))}
    </div>
  );
}

function BlockView({ entry, bare = false }: { entry: BlockEntry; bare?: boolean }) {
  const Block = blockComponent(entry);
  if (!Block) return null;

  if (bare) return <Block />;

  return (
    <section className={cn('flex min-w-0 flex-col gap-2', entry.wide && 'md:col-span-2')}>
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-xs text-muted-foreground">{entry.name}</code>
        <CopyButton text={installCommand(entry.name)} />
      </div>
      <Block />
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), 1500);

    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={text}
      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {copied ? 'Copied' : 'Copy install command'}
    </button>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-secondary text-secondary-foreground',
      )}
    >
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="inline-flex rounded-lg bg-muted p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              active && 'bg-background text-foreground shadow-sm',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
