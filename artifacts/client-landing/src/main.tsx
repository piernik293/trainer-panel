import { createRoot } from 'react-dom/client';

import App from './App';

import { initTheme } from '@workspace/design-tokens';
import './index.css';

initTheme();

createRoot(document.getElementById('root')!).render(<App />);
