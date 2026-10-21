import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

// StrictMode on, as in a new shadcn app: the blocks must survive its double mount.
const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
