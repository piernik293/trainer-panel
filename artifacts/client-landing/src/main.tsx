import { createRoot } from 'react-dom/client';

import App from './App';

import { initTheme } from '@workspace/design-tokens';
import { installErrorReporting } from './lib/errorReport';
import './index.css';

initTheme();
installErrorReporting();

// Offline support (PWA): production builds only — in dev the worker would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // no service worker (private mode, unsupported) — the app works online as before
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
