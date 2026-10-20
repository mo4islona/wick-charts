import { NUMBER_MUTED_OPACITY, NUMBER_SCRIPT_STYLE, numberRuns } from '@wick-charts/core';

export interface NumberTextProps {
  /** A formatted number, e.g. the output of `formatSignificant`. */
  text: string;
  /** Mute the characters that only place the value (`0.0₅` in `0.0₅8123`). Default `true`. */
  mute?: boolean;
}

const SCRIPT_PART = { sub: 'zeros', sup: 'exponent' } as const;

/** A formatted number without motion: the zero count and powers shrink, placing zeros mute. */
export function NumberText({ text, mute = true }: NumberTextProps) {
  const runs = numberRuns(text, { mute });
  const plain = runs.every((run) => run.kind === 'plain' && !run.muted);
  if (plain) return <>{text}</>;

  return (
    <>
      {runs.map((run, i) => {
        const script = run.kind === 'plain' ? null : NUMBER_SCRIPT_STYLE[run.kind];

        return (
          <span
            key={i}
            data-part={run.kind === 'plain' ? undefined : SCRIPT_PART[run.kind]}
            style={{
              opacity: run.muted ? NUMBER_MUTED_OPACITY : undefined,
              fontSize: script?.fontSize,
              position: script === null ? undefined : 'relative',
              top: script?.top,
            }}
          >
            {run.text}
          </span>
        );
      })}
    </>
  );
}
