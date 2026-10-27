import { useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { useFramework } from '../../context/framework';
import type { ChartCodeConfig } from '../CodePreview';
import { generateCode } from '../CodePreview';
import { FrameworkSelect } from '../FrameworkSelect';
import { HighlightedCode } from './CodeView';
import { CHECK_ICON, COPY_ICON } from './icons';

// FrameworkSelect is used here in compact mode (icon-only tiles) so it
// fits the code-panel header without dominating it.

/** Which chart the code is for, on a page of several. */
export interface CodeCaption {
  title: string;
  sub?: string;
}

/** Framework tabs + copy button + tokenized code.
 * Code panel inherits colors from ChartTheme — no independent theme toggle. */
export function CodeTabs({
  config,
  theme,
  caption,
}: {
  config: ChartCodeConfig | ChartCodeConfig[];
  theme: ChartTheme;
  caption?: CodeCaption;
}) {
  const [fw] = useFramework();
  const [copied, setCopied] = useState(false);

  const code = generateCode(config, fw);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="pg-code-wrap">
      <div className="pg-head">
        {caption && (
          <span className="pg-code-caption">
            {caption.title}
            {caption.sub && <span className="pg-code-sub">{caption.sub}</span>}
          </span>
        )}

        <FrameworkSelect theme={theme} compact />

        <div className="pg-actions">
          <button
            type="button"
            onClick={copy}
            title={copied ? 'Copied' : 'Copy'}
            aria-label={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? CHECK_ICON : COPY_ICON}
          </button>
        </div>
      </div>

      <HighlightedCode code={code} />
    </div>
  );
}
