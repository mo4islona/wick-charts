import { SEARCH_ICON } from './icons';

const CLOSE_ICON = (
  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
    <path d="M1.5 1.5 L6.5 6.5 M6.5 1.5 L1.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export function SearchRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="panel-search">
      {SEARCH_ICON}
      <input type="text" placeholder="Search settings" value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="clear" aria-label="Clear search" onClick={() => onChange('')}>
          {CLOSE_ICON}
        </button>
      )}
    </div>
  );
}
