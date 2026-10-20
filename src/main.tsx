import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { CrashBoundary } from './ui/CrashBoundary';
import { installGlobalHandlers } from './ui/installGlobalHandlers';
import { installStaticSkipLink } from './ui/skipLink';
import './styles/tokens.css';
import './styles/base.css';
import './styles/forced-colors.css';

const root = document.getElementById('root');

if (root !== null) {
  installGlobalHandlers();
  installStaticSkipLink();
  createRoot(root).render(
    <StrictMode>
      <CrashBoundary scope="root">
        <App />
      </CrashBoundary>
    </StrictMode>,
  );
}
