import { createRoot } from 'react-dom/client';

import App from './App';

// StrictMode is intentionally off. Its dev-only mount→unmount→remount re-seeds
// streaming charts (a second `setSeriesData` of the same seed), which collapses
// the `viewport.initialRange` warm-up window via the bulk-replace fitToData path
// in core. The same fragility affects real re-seeds in core (tracked for the
// viewport-engine refactor); this just keeps the docs/playground demos honest.
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
