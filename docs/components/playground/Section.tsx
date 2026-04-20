import { type KeyboardEvent, type ReactNode, useState } from 'react';

import { CHEV_ICON, RESET_ICON } from './icons';

export function Section({
  icon,
  title,
  defaultOpen = true,
  onReset,
  active,
  children,
}: {
  icon?: ReactNode;
  title: string;
  defaultOpen?: boolean;
  onReset?: () => void;
  active?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => setOpen((o) => !o);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <section className={`sec ${open ? 'open' : ''}`}>
      {/* biome-ignore lint/a11y/useSemanticElements: button would nest inside the reset button below; we keep this as a div with button role. */}
      <div className="sec-head" role="button" tabIndex={0} onClick={toggle} onKeyDown={onKeyDown} aria-expanded={open}>
        {CHEV_ICON}
        {icon && <span className="sec-icon">{icon}</span>}
        <h3>{title}</h3>
        {active !== undefined && active > 0 && (
          <span className="sec-count" title={`${active} setting${active === 1 ? '' : 's'} changed from default`}>
            {active} {active === 1 ? 'change' : 'changes'}
          </span>
        )}
        {onReset && active !== undefined && active > 0 && (
          <button
            type="button"
            className="sec-reset"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            title="Reset section"
            aria-label="Reset section"
          >
            {RESET_ICON}
          </button>
        )}
      </div>
      <div className="sec-collapse" aria-hidden={!open}>
        <div className="sec-body">{children}</div>
      </div>
    </section>
  );
}
