import type { ReactNode } from 'react';

export function Row({
  label,
  hint,
  span,
  children,
}: {
  label: string;
  hint?: string;
  span?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div className={`row${span === 1 ? ' row-half' : ''}`}>
      <div className="row-label">
        <span>{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </div>
      <div className="row-ctrl">{children}</div>
    </div>
  );
}
