import { createRoot } from 'react-dom/client';

import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';

import { initTheme } from '@workspace/design-tokens';
import './index.css';

initTheme();

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
