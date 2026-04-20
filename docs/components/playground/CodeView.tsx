import Prism from 'prismjs';
// Side-effect imports: register tokenizers. Previously loaded only through
// controls.tsx — carry them here so the new module is self-contained.
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import { type ReactNode, useMemo, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { CHECK_ICON, COPY_ICON } from './icons';
import { themeSurfaceVars } from './themeSurface';

interface FlatToken {
  type: string;
  text: string;
}

function flattenTokens(tokens: (string | Prism.Token)[], inheritedType?: string): FlatToken[] {
  const out: FlatToken[] = [];
  for (const t of tokens) {
    if (typeof t === 'string') {
      out.push({ type: inheritedType ?? 'text', text: t });
      continue;
    }

    const type = t.type;
    if (Array.isArray(t.content)) {
      out.push(...flattenTokens(t.content as (string | Prism.Token)[], type));
      continue;
    }

    out.push({ type, text: String(t.content) });
  }

  return out;
}

function detectGrammar(code: string): Prism.Grammar {
  const isReactish = code.includes('import ') && !code.includes('<template>') && !code.includes('<script>');

  return isReactish ? Prism.languages.jsx : Prism.languages.markup;
}

/**
 * Tokenize to flat spans with CSS-class-based theming.
 *
 * Pass `theme` when the component is rendered outside a `.wick-playground`
 * root that already injects the CSS vars (e.g. from DashboardPage). The
 * component wraps itself in a scoped `.wick-playground .pg-code-wrap`
 * surface so colors, bg, and token palette all derive from ChartTheme.
 */
export function HighlightedCode({
  code,
  theme,
  prompt,
}: {
  code: string;
  theme?: ChartTheme;
  /** Shell-style prefix (e.g. "$") rendered before the first line in muted color.
   * Not included in the copied text. */
  prompt?: string;
}) {
  const lines = useMemo(() => {
    const tokens = flattenTokens(Prism.tokenize(code, detectGrammar(code)));
    const rendered: ReactNode[][] = [[]];
    let lineIdx = 0;

    for (const tok of tokens) {
      const parts = tok.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) {
          lineIdx += 1;
          rendered[lineIdx] = [];
        }
        if (part.length > 0) {
          rendered[lineIdx].push(
            <span key={rendered[lineIdx].length} className={`tok-${tok.type}`}>
              {part}
            </span>,
          );
        }
      });
    }

    return rendered;
  }, [code]);

  const pre = (
    <pre className="pg-code">
      <code>
        {lines.map((line, i) => (
          <div key={`L${i}`} className="pg-line">
            {prompt && i === 0 && <span className="pg-prompt">{prompt} </span>}
            <span className="pg-src">{line.length === 0 ? '\u00A0' : line}</span>
          </div>
        ))}
      </code>
    </pre>
  );

  if (!theme) return pre;

  return (
    <div className="wick-playground" style={themeSurfaceVars(theme)}>
      <div className="pg-code-wrap pg-code-wrap--standalone">
        <CopyButton code={code} />
        {pre}
      </div>
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // ignore
      });
  };

  return (
    <button
      type="button"
      className="pg-code-copy"
      onClick={onClick}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? CHECK_ICON : COPY_ICON}
    </button>
  );
}
