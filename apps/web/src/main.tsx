import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/pwa';
import './styles/tokens.css';
import './styles/base.css';
import './styles/intake.css';
import './styles/report.css';
import './styles/charts.css';
import './styles/timeline.css';
import './styles/print.css';

createRoot(document.getElementById('root')!).render(<App />);
registerServiceWorker();
