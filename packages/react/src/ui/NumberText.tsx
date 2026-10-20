import {
  NUMBER_HIDDEN_STYLE,
  NUMBER_MUTED_OPACITY,
  NUMBER_SCRIPT_STYLE,
  accessibleNumberText,
  hasScriptDigits,
  numberRuns,
} from '@wick-charts/core';

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

  // Script digits show as plain digits, so a reader gets a hidden copy: `0.0₅81` is not `0.0581`.
  const script = hasScriptDigits(text);

  return (
    <>
      {script && <span style={NUMBER_HIDDEN_STYLE}>{accessibleNumberText(text)}</span>}
      <span aria-hidden={script || undefined}>
        {runs.map((run, i) => {
          const scriptStyle = run.kind === 'plain' ? null : NUMBER_SCRIPT_STYLE[run.kind];

          return (
            <span
              key={i}
              data-part={run.kind === 'plain' ? undefined : SCRIPT_PART[run.kind]}
              style={{
                opacity: run.muted ? NUMBER_MUTED_OPACITY : undefined,
                fontSize: scriptStyle?.fontSize,
                position: scriptStyle === null ? undefined : 'relative',
                top: scriptStyle?.top,
              }}
            >
              {run.text}
            </span>
          );
        })}
      </span>
    </>
  );
}
